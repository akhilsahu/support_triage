"""
Background ingestion task: parse → chunk → summarise → index.

Runs detached from the HTTP request that started it, reporting progress onto the
IngestionJob row (app/models/ingestion_job.py) so the dashboard can follow along
and surface failures.

Backend-agnostic by design: takes only JSON-safe arguments (ids and a temp file
path), so it behaves identically whether the in-process runner awaits it or a
Celery worker picks it up in a separate process.
"""

from __future__ import annotations

import functools
import os
import time
from typing import Optional
from uuid import UUID

import anyio
import structlog

from app.orchestra.ai.ingestion.jobs.registry import job

logger = structlog.get_logger()

# Coarse stage weights. Parsing dominates wall-clock on image-heavy PDFs, so it
# owns most of the bar; the rest move quickly.
_PARSE_FLOOR, _PARSE_CEILING = 5, 70
_CHUNKING_PCT, _INDEXING_PCT = 75, 85

# Don't write a progress row for every page of a 200-page document.
_PROGRESS_MIN_INTERVAL_S = 1.0


async def _set_job(job_id: str, **fields) -> None:
    """Patch an IngestionJob row. Never raises — a progress write failing must
    not abort an otherwise healthy ingestion."""
    from app.core.database import AsyncSessionLocal
    from app.models.ingestion_job import IngestionJob
    try:
        async with AsyncSessionLocal() as db:
            row = await db.get(IngestionJob, UUID(job_id))
            if row is None:
                return
            for k, v in fields.items():
                setattr(row, k, v)
            await db.commit()
    except Exception as e:
        logger.warning("ingestion.job.status_write_failed", job_id=job_id, error=str(e))


_KB_LINK_ATTEMPTS = 3
_KB_LINK_RETRY_DELAY_S = 2.0


async def _attach_kb_item(kb_id: str, doc_id: str, title: str,
                          item_type: str = "doc", content: Optional[str] = None,
                          topic: Optional[str] = None,
                          doc_label: Optional[str] = None,
                          description: Optional[str] = None,
                          context_enriched: bool = False,
                          ai_cost_usd: float = 0.0) -> None:
    """
    Create the KnowledgeBaseItem pointing at the freshly indexed document.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem

    last_error: Optional[Exception] = None
    for attempt in range(_KB_LINK_ATTEMPTS):
        try:
            async with AsyncSessionLocal() as db:
                kb = await db.get(KnowledgeBase, UUID(kb_id))
                item_topic = topic or (kb.default_topic if kb else None) or None
                db.add(KnowledgeBaseItem(
                    kb_id=UUID(kb_id),
                    item_type=item_type,
                    title=title,
                    doc_id=doc_id,
                    indexed_doc_id=doc_id,
                    topic=item_topic,
                    doc_label=doc_label or None,
                    description=description or None,
                    content=content,   # source URL for item_type="url"
                    context_enriched=context_enriched,
                    ai_cost_usd=ai_cost_usd,
                ))
                await db.commit()


            # Chunks were stamped topic="" during indexing (the topic is only
            # known here, after the KB row is read), so re-stamp them or a
            # topic-scoped agent would never match this document.
            if topic and kb:
                try:
                    from app.rag.vector_store import get_vector_store
                    get_vector_store().retag_doc(str(kb.space_id), doc_id, topic=topic)
                except Exception as e:
                    logger.error("ingestion.job.retag_failed",
                                 doc_id=doc_id, topic=topic, error=str(e))
            return
        except Exception as e:
            last_error = e
            if attempt < _KB_LINK_ATTEMPTS - 1:
                logger.warning("ingestion.job.kb_link_retry",
                               kb_id=kb_id, doc_id=doc_id, attempt=attempt + 1, error=str(e))
                await anyio.sleep(_KB_LINK_RETRY_DELAY_S)

    assert last_error is not None
    raise last_error


@job("ingest_document")
async def ingest_document(
    *,
    job_id: str,
    space_id: str,
    temp_path: str,
    filename: str,
    doc_type: str = "general",
    session_id: str = "",
    kb_name: str = "",
    description: str = "",
    expiry_date: str = "",
    org_name: str = "",
    kb_id: str = "",
    item_title: str = "",
    display_name: str = "",
    item_type: str = "doc",
    source_url: str = "",
    topic: str = "",
    doc_label: str = "",
    enable_enrichment: Optional[bool] = None,
    **kwargs,
) -> None:

    """Ingest one uploaded document, recording progress on its job row.

    `filename` drives PARSING (the extension picks the parser). `display_name`,
    when given, is what gets stored on the chunks and therefore what citations
    show the customer — used by URL ingestion, where the parser needs a real
    extension ("page.html") but a citation should read as the page's title.
    Defaults to `filename` for ordinary file uploads.
    """
    import uuid as _uuid
    from app.config import settings
    from app.orchestra.ai.chunking import chunk as chunk_document, get_config as get_chunk_config
    from app.orchestra.ai.ingestion import get_ingestion_service
    from app.rag.vector_store import get_vector_store

    svc = get_ingestion_service()
    started = time.monotonic()

    try:
        await _set_job(job_id, status="parsing", progress=_PARSE_FLOOR, stage_detail="Reading document")

        with open(temp_path, "rb") as fh:
            raw = fh.read()

        # Progress plumbing: the parser calls this from a worker thread, so hop
        # back onto the loop to touch the database.
        last_write = {"t": 0.0}

        def on_page(current: int, total: int) -> None:
            now = time.monotonic()
            if now - last_write["t"] < _PROGRESS_MIN_INTERVAL_S and current < total:
                return
            last_write["t"] = now
            span = _PARSE_CEILING - _PARSE_FLOOR
            pct = _PARSE_FLOOR + int(span * (current / max(total, 1)))
            try:
                anyio.from_thread.run(
                    _set_job, job_id,
                    status="parsing", progress=pct,
                    stage_detail=f"Reading page {current} of {total}",
                )
            except Exception:
                pass   # not worth failing an ingestion over a progress update

        # parse() is synchronous and can spend minutes in vision calls — keep it
        # off the event loop so the rest of the app stays responsive.
        parsed = await anyio.to_thread.run_sync(
            functools.partial(svc.parse, raw, filename, progress_cb=on_page)
        )

        if not parsed.pages or not parsed.full_text.strip():
            raise ValueError("Document appears empty or has no extractable text.")

        await _set_job(job_id, status="chunking", progress=_CHUNKING_PCT,
                       stage_detail="Splitting into chunks", pages=parsed.page_count)

        cfg = get_chunk_config(filename)
        chunks = await anyio.to_thread.run_sync(chunk_document, parsed)
        if not chunks:
            raise ValueError("Document produced no chunks.")

        # Optional Contextual AI Enrichment (Option 1)
        enriched_flag = False
        total_ai_cost = 0.0

        should_enrich = enable_enrichment if enable_enrichment is not None else getattr(settings, "ENABLE_CONTEXTUAL_ENRICHMENT", True)

        if should_enrich:
            await _set_job(job_id, status="enriching", progress=75,
                           stage_detail=f"AI context-enriching {len(chunks)} chunks",
                           context_enriched=True)
            try:
                from app.orchestra.ai.ingestion.contextual_enrichment import enrich_chunks_contextually
                doc_label_val = doc_label or kwargs.get("doc_label") or ""

                async def _on_enrich_progress(completed: int, total: int, cost_usd: float, eta_sec: int):
                    pct = 75 + int(15 * (completed / max(total, 1)))
                    stage_str = f"AI context-enriching chunk {completed}/{total} (~{eta_sec}s remaining)"
                    await _set_job(job_id, status="enriching", progress=pct, stage_detail=stage_str,
                                   eta_seconds=eta_sec, context_enriched=True, ai_cost_usd=cost_usd)

                chunks, total_ai_cost = await enrich_chunks_contextually(
                    doc_title=item_title or display_name or filename,
                    full_text=parsed.full_text,
                    chunks=chunks,
                    doc_type=doc_type,
                    topic=topic,
                    doc_label=doc_label_val,
                    description=description,
                    kb_name=kb_name,
                    org_name=org_name,
                    progress_cb=_on_enrich_progress,
                )
                enriched_flag = True

            except Exception as enrich_err:
                logger.warning("ingestion.contextual_enrichment.failed_proceeding_raw",
                               job_id=job_id, error=str(enrich_err))
        else:
            logger.info("ingestion.contextual_enrichment.skipped",
                        job_id=job_id, filename=filename, reason="disabled_by_config_or_header")

        await _set_job(job_id, status="indexing", progress=_INDEXING_PCT,
                       stage_detail=f"Indexing {len(chunks)} chunks", chunks=len(chunks),
                       eta_seconds=5, context_enriched=enriched_flag, ai_cost_usd=total_ai_cost)


        # Summary is a nice-to-have: a failure here shouldn't lose the document.
        from app.api.v1.documents import _generate_summary
        semantic_summary = await _generate_summary(parsed.full_text)

        ttl_days: Optional[int] = None
        if expiry_date:
            try:
                from datetime import date
                ttl_days = max(1, (date.fromisoformat(expiry_date) - date.today()).days)
            except ValueError:
                ttl_days = None

        doc_id = str(_uuid.uuid4())[:8]
        store = get_vector_store()
        await anyio.to_thread.run_sync(
            functools.partial(
                store.upsert_client_chunks,
                client_id=space_id,
                session_id=session_id or str(_uuid.uuid4()),
                doc_id=doc_id,
                filename=display_name or filename,
                extension=parsed.extension,
                strategy=cfg.strategy.value,
                doc_type=doc_type,
                ttl_days=ttl_days,
                kb_name=kb_name,
                # Agents scope retrieval with `kb_id $in [...]`, so a chunk
                # without this is unreachable by every custom agent.
                kb_id=kb_id or "",
                space_id=space_id,
                org_name=org_name,
                description=description,
                semantic_summary=semantic_summary,
                topic=topic,
                chunks=[
                    {
                        "text": c.text, "page": c.page,
                        "chunk_index": c.chunk_index, "section": c.section,
                        # Table flags used to stop here: the serialization dropped
                        # them, so nothing downstream could tell a fee-table row
                        # from prose. Fact extraction selects on is_table_row.
                        "extra": {
                            "is_table":     c.is_table,
                            "is_table_row": c.is_table_row,
                            "row_label":    c.row_label,
                        },
                    }
                    for c in chunks
                ],
            )
        )

        # Cache the parsed document for fact extraction to bypass PyMuPDF parsing
        try:
            import json
            cache_dir = Path("uploads/raw_ingestion_json")
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_path = cache_dir / f"{doc_id}.json"
            parsed_data = {
                "filename": parsed.filename,
                "extension": parsed.extension,
                "pages": [
                    {
                        "page": p.page,
                        "text": p.text,
                        "section": p.section,
                        "is_table": p.is_table
                    }
                    for p in parsed.pages
                ]
            }
            cache_path.write_text(json.dumps(parsed_data, ensure_ascii=False))
            logger.info("ingestion.job.cache_saved", job_id=job_id, doc_id=doc_id, path=str(cache_path))
        except Exception as cache_e:
            logger.warning("ingestion.job.cache_failed", job_id=job_id, doc_id=doc_id, error=str(cache_e))

        # Link into the knowledge base now that there's a real doc_id — doing it
        # at upload time would have stored an empty reference. Deliberately not
        # fatal: the document is already indexed and searchable, so a failure
        # here shouldn't present the whole ingestion as failed. _attach_kb_item
        # already retries transient failures; an error() here means every
        # retry was exhausted — chunks are live and citable but invisible on
        # the KB dashboard until someone notices this log line.
        doc_label = kwargs.get("doc_label") or ""
        if kb_id:
            try:
                await _attach_kb_item(
                    kb_id, doc_id, item_title or filename,
                    item_type=item_type, 
                    content=source_url or (f"file://{Path(temp_path).absolute()}" if item_type == "doc" else None),
                    topic=topic or None, doc_label=doc_label or None,
                    description=description or None,
                    context_enriched=enriched_flag,
                    ai_cost_usd=total_ai_cost,
                )
            except Exception as e:
                logger.error("ingestion.job.kb_link_failed",
                             job_id=job_id, kb_id=kb_id, doc_id=doc_id, error=str(e))

        await _set_job(job_id, status="done", progress=100, doc_id=doc_id,
                       stage_detail=f"{parsed.page_count} pages, {len(chunks)} chunks",
                       eta_seconds=None, context_enriched=enriched_flag, ai_cost_usd=total_ai_cost,
                       error=None)

        logger.info("ingestion.job.done", job_id=job_id, filename=filename, doc_id=doc_id,
                    chunks=len(chunks), seconds=round(time.monotonic() - started, 1))

    except Exception as e:
        logger.exception("ingestion.job.failed", job_id=job_id, filename=filename, error=str(e))
        await _set_job(job_id, status="failed", stage_detail=None, error=str(e)[:2000])

    finally:
        # We no longer delete the temp upload so it can be used for Fact Extraction.
        pass

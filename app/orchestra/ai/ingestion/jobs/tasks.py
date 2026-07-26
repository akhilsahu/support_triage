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


async def _attach_kb_item(kb_id: str, doc_id: str, title: str) -> None:
    """Create the KnowledgeBaseItem pointing at the freshly indexed document."""
    from app.core.database import AsyncSessionLocal
    from app.models.knowledge_base import KnowledgeBaseItem
    async with AsyncSessionLocal() as db:
        db.add(KnowledgeBaseItem(
            kb_id=UUID(kb_id),
            item_type="doc",
            title=title,
            doc_id=doc_id,
            indexed_doc_id=doc_id,
        ))
        await db.commit()


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
) -> None:
    """Ingest one uploaded document, recording progress on its job row."""
    import uuid as _uuid
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

        await _set_job(job_id, status="indexing", progress=_INDEXING_PCT,
                       stage_detail=f"Indexing {len(chunks)} chunks", chunks=len(chunks))

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
                filename=filename,
                extension=parsed.extension,
                strategy=cfg.strategy.value,
                doc_type=doc_type,
                ttl_days=ttl_days,
                kb_name=kb_name,
                space_id=space_id,
                org_name=org_name,
                description=description,
                semantic_summary=semantic_summary,
                chunks=[
                    {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
                    for c in chunks
                ],
            )
        )

        # Link into the knowledge base now that there's a real doc_id — doing it
        # at upload time would have stored an empty reference. Deliberately not
        # fatal: the document is already indexed and searchable, so a failure
        # here shouldn't present the whole ingestion as failed.
        if kb_id:
            try:
                await _attach_kb_item(kb_id, doc_id, item_title or filename)
            except Exception as e:
                logger.warning("ingestion.job.kb_link_failed",
                               job_id=job_id, kb_id=kb_id, error=str(e))

        await _set_job(job_id, status="done", progress=100, doc_id=doc_id,
                       stage_detail=f"{parsed.page_count} pages, {len(chunks)} chunks",
                       error=None)
        logger.info("ingestion.job.done", job_id=job_id, filename=filename, doc_id=doc_id,
                    chunks=len(chunks), seconds=round(time.monotonic() - started, 1))

    except Exception as e:
        logger.exception("ingestion.job.failed", job_id=job_id, filename=filename, error=str(e))
        await _set_job(job_id, status="failed", stage_detail=None, error=str(e)[:2000])

    finally:
        # The temp upload is ours to clean up regardless of outcome.
        try:
            os.unlink(temp_path)
        except OSError:
            pass

import functools
import time
from typing import Optional, List
import uuid

import anyio
import structlog
from pydantic import BaseModel

from app.config import settings
from app.orchestra.ai.chunking import chunk as chunk_document, get_config as get_chunk_config
from app.orchestra.ai.ingestion import get_ingestion_service
from app.rag.vector_store import get_vector_store
from app.services.ai_usage_context import AiUsageContext, set_ai_usage_context

logger = structlog.get_logger()

class IndexedSourceResult(BaseModel):
    doc_id: str
    page_count: int
    chunk_count: int
    ai_cost_usd: float
    context_enriched: bool

async def parse_and_index(
    *,
    job_id: str,
    space_id: str,
    kb_id: str,
    raw_bytes: bytes,
    filename: str,
    doc_id: str,
    doc_type: str = "general",
    enable_enrichment: Optional[bool] = None,
    progress_cb=None
) -> IndexedSourceResult:
    """
    Extracts reusable processing primitives from `ingest_document`.
    Parses, chunks, enriches, and indexes the document.
    """
    set_ai_usage_context(AiUsageContext(
        space_id=uuid.UUID(space_id) if space_id else None,
        kb_id=uuid.UUID(kb_id) if kb_id else None,
    ))

    svc = get_ingestion_service()
    
    # 1. Parse
    def _on_page(current: int, total: int):
        if progress_cb:
            progress_cb("parsing", current, total)
            
    parsed = await anyio.to_thread.run_sync(
        functools.partial(svc.parse, raw_bytes, filename, progress_cb=_on_page)
    )

    if not parsed.pages or not parsed.full_text.strip():
        raise ValueError("Document appears empty or has no extractable text.")

    # 2. Chunk
    if progress_cb:
        progress_cb("chunking", 0, parsed.page_count)
        
    cfg = get_chunk_config(filename)
    chunks = await anyio.to_thread.run_sync(chunk_document, parsed)
    if not chunks:
        raise ValueError("Document produced no chunks.")

    # 3. Contextual AI Enrichment
    enriched_flag = False
    total_ai_cost = 0.0

    should_enrich = enable_enrichment if enable_enrichment is not None else getattr(settings, "ENABLE_CONTEXTUAL_ENRICHMENT", True)

    if should_enrich:
        try:
            from app.orchestra.ai.ingestion.contextual_enrichment import enrich_chunks_contextually

            async def _on_enrich_progress(completed: int, total: int, cost_usd: float, eta_sec: int):
                if progress_cb:
                    progress_cb("enriching", completed, total, ai_cost_usd=cost_usd)

            chunks, total_ai_cost = await enrich_chunks_contextually(
                doc_title=filename,
                full_text=parsed.full_text,
                chunks=chunks,
                doc_type=doc_type,
                topic="",
                doc_label="",
                description="",
                kb_name="",
                org_name="",
                progress_cb=_on_enrich_progress,
            )
            enriched_flag = True

        except Exception as enrich_err:
            logger.warning("ingestion.pipeline.contextual_enrichment.failed", job_id=job_id, error=str(enrich_err))

    # 4. Summary
    semantic_summary = ""
    try:
        from app.api.v1.documents import _generate_summary
        semantic_summary = await _generate_summary(parsed.full_text)
    except Exception as e:
        logger.warning("ingestion.pipeline.summary.failed", error=str(e))

    # 5. Index
    if progress_cb:
        progress_cb("indexing", 0, len(chunks))
        
    store = get_vector_store()
    await anyio.to_thread.run_sync(
        functools.partial(
            store.upsert_client_chunks,
            client_id=space_id,
            session_id=str(uuid.uuid4()),
            doc_id=doc_id,
            filename=filename,
            extension=parsed.extension,
            strategy=cfg.strategy.value,
            doc_type=doc_type,
            ttl_days=None,
            kb_name="",
            kb_id=kb_id,
            space_id=space_id,
            org_name="",
            description="",
            semantic_summary=semantic_summary,
            topic="",
            chunks=[
                {
                    "text": c.text, "page": c.page,
                    "chunk_index": c.chunk_index, "section": c.section,
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

    return IndexedSourceResult(
        doc_id=doc_id,
        page_count=parsed.page_count,
        chunk_count=len(chunks),
        ai_cost_usd=total_ai_cost,
        context_enriched=enriched_flag
    )

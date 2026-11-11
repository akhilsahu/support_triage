import functools
from typing import Optional
import uuid

import anyio
import structlog
from pydantic import BaseModel

from app.orchestra.ai.ingestion.preparation import parse_source, prepare_document
from app.orchestra.ai.ingestion.cancellation import check_source_cancellation
from app.orchestra.ai.ingestion.indexing import embed_and_store_chunks
from app.orchestra.ai.ingestion.summarization import generate_summary
from app.orchestra.ai.ingestion.core.text_utils import sanitize_extracted_text
from app.services.ai_usage_context import ai_usage_scope

logger = structlog.get_logger()

class IndexedSourceResult(BaseModel):
    doc_id: str
    page_count: int
    chunk_count: int
    ai_cost_usd: Optional[float]
    ai_cost_details: dict = {}
    context_enriched: bool
    full_text: Optional[str] = None
    is_scanned: bool = False

async def parse_and_index(
    *,
    job_id: str,
    space_id: str,
    kb_id: str,
    raw_bytes: bytes,
    filename: str,
    doc_id: str,
    doc_type: str = "general",
    is_preview: bool = False,
    progress_cb=None,
    enable_summary: bool = True,
    web: bool = False,
) -> IndexedSourceResult:
    """Process a KB source; queue dispatch and fact extraction live in orchestration.

    Preview parses only. Yullo initial processing uses the full chunk/index
    path; product callers control retrieval activation and fact review.
    """
    with ai_usage_scope(
        space_id=uuid.UUID(space_id) if space_id else None,
        kb_id=uuid.UUID(kb_id) if kb_id else None,
        runtime_kind="ingestion",
    ) as costs:
        # 1. Parse
        def _on_page(current: int, total: int):
            check_source_cancellation()
            if progress_cb:
                progress_cb("parsing", current, total)

        parsed = await anyio.to_thread.run_sync(
            functools.partial(parse_source, raw_bytes, filename, progress_cb=_on_page, is_preview=is_preview)
        )

        if not parsed.pages or not parsed.full_text.strip():
            raise ValueError("Document appears empty or has no extractable text.")

        # 2. Chunk, including private owner inspection when requested.
        # Extract is_scanned from parser metadata (set by PDF parsers based
        # on character density — fewer than 50 chars/page signals a scanned image)
        is_scanned = parsed.metadata.get("is_scanned", False)

        if is_preview:
            # Just return the preview data without chunking or indexing
            clean_full_text = sanitize_extracted_text(parsed.full_text)
            return IndexedSourceResult(
                doc_id=doc_id,
                page_count=parsed.page_count,
                chunk_count=0,
                ai_cost_usd=costs.total,
                ai_cost_details=costs.snapshot(),
                context_enriched=False,
                full_text=clean_full_text,
                is_scanned=is_scanned
            )

        if progress_cb:
            progress_cb("chunking", 0, parsed.page_count)

        chunk_config = None
        if web:
            from app.orchestra.ai.config import get_web_chunk_config
            chunk_config = get_web_chunk_config(filename)
        prepared = await anyio.to_thread.run_sync(functools.partial(prepare_document, parsed, config=chunk_config))
        chunks = prepared.chunks
        if progress_cb:
            progress_cb("chunking", len(chunks), len(chunks))

        # 3. Summary
        semantic_summary = ""
        if enable_summary and not is_preview:
            try:
                semantic_summary = await generate_summary(parsed.full_text)
            except Exception as e:
                logger.warning("ingestion.pipeline.summary.failed", error=str(e))

        # 4. Index
        if progress_cb:
            progress_cb("indexing", 0, len(chunks))

        await embed_and_store_chunks(
            prepared, client_id=space_id, session_id=str(uuid.uuid4()), doc_id=doc_id,
            filename=filename, doc_type=doc_type, ttl_days=None, kb_name="", kb_id=kb_id,
            space_id=space_id, org_name="", description="", semantic_summary=semantic_summary, topic="",
        )
        if progress_cb:
            progress_cb("indexing", len(chunks), len(chunks))

        # Sanitise extracted text before persisting — fixes font-encoding
        # artefacts (caron→apostrophe, ogonek→quote, etc.) and strips binary
        # control characters so the preview modal always shows clean text.
        clean_full_text = sanitize_extracted_text(parsed.full_text)

        return IndexedSourceResult(
            doc_id=doc_id,
            page_count=parsed.page_count,
            chunk_count=len(chunks),
            ai_cost_usd=costs.total,
            ai_cost_details=costs.snapshot(),
            context_enriched=False,
            full_text=clean_full_text,
            is_scanned=is_scanned
        )

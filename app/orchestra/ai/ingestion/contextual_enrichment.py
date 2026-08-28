"""
app/orchestra/ai/ingestion/contextual_enrichment.py

Anthropic-style Contextual Chunk Enrichment.
Generates a 1-2 sentence LLM context prefix for each document chunk during ingestion
using ALL document & chunk metadata (title, doc_type, topic, doc_label, description, page, section, table labels).
Makes chunks completely self-contained, significantly improving RAG retrieval accuracy.
"""

from __future__ import annotations

import asyncio
import time
from typing import List, Optional
import structlog

from app.rag.document_parser import Chunk

logger = structlog.get_logger()


async def _enrich_single_chunk(
    doc_title: str,
    meta_block: str,
    doc_overview: str,
    chunk: Chunk,
    sem: asyncio.Semaphore,
) -> tuple[Chunk, float]:
    from app.services.llm_service import llm_service

    cost_usd = 0.0
    async with sem:
        section_label = chunk.section or "General"
        row_label = getattr(chunk, "row_label", None) or ""
        table_context = f"\nTable Row Label: {row_label}" if row_label else ""

        prompt = (
            f"Document Title: {doc_title}\n"
            f"{meta_block}\n"
            f"Document Overview:\n{doc_overview[:3000]}\n\n"
            f"Chunk Location: Page {chunk.page} · Section: {section_label}{table_context}\n"
            f"Chunk Content:\n{chunk.text[:2000]}\n\n"
            "Task: Write a concise 1-2 sentence contextual summary describing exactly which product, "
            "policy, topic, or section this chunk belongs to, incorporating document metadata so it is completely self-contained.\n"
            "Return ONLY the 1-2 sentence context header without any meta-commentary."
        )

        try:
            res = await llm_service.generate_with_fallback(
                messages=[{"role": "user", "content": prompt}],
                system_prompt="You are an expert AI document indexer. Output only 1-2 sentences of context header.",
                temperature=0.1,
                max_tokens=140,
            )
            if res and res.get("content"):
                prefix = res["content"].strip()
                if prefix:
                    chunk.text = f"[Context: {prefix}]\n\n{chunk.text}"

            usage = res.get("usage") if isinstance(res, dict) else None
            if usage:
                p_tokens = usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0) or 0
                c_tokens = usage.get("completion_tokens", 0) or usage.get("output_tokens", 0) or 0
                cost_usd = (p_tokens * 0.00000015) + (c_tokens * 0.00000060)
            else:
                # Approximate token counts if usage dict is omitted by provider
                p_tokens = len(prompt) // 4
                c_tokens = len(chunk.text) // 4
                cost_usd = (p_tokens * 0.00000015) + (c_tokens * 0.00000060)

        except Exception as e:
            logger.warning(
                "ingestion.contextual_enrichment.chunk_failed_fallback",
                chunk_index=chunk.chunk_index,
                page=chunk.page,
                section=section_label,
                error=str(e),
            )
    return chunk, cost_usd


async def enrich_chunks_contextually(
    doc_title: str,
    full_text: str,
    chunks: List[Chunk],
    doc_type: str = "",
    topic: str = "",
    doc_label: str = "",
    description: str = "",
    kb_name: str = "",
    org_name: str = "",
    max_concurrent: int = 5,
    progress_cb: Optional[Any] = None,
) -> tuple[List[Chunk], float]:
    """
    Enrich each chunk in-place with an LLM-generated contextual prefix incorporating ALL metadata.
    Returns (enriched_chunks, total_cost_usd). Reports live ETA and progress via progress_cb.
    """
    if not chunks:
        return chunks, 0.0

    started = time.monotonic()
    doc_overview = full_text[:4000].strip()

    meta_parts = []
    if doc_type:
        meta_parts.append(f"Document Type: {doc_type}")
    if topic:
        meta_parts.append(f"Topic/Subject: {topic}")
    if doc_label:
        meta_parts.append(f"Doc Label/Tag: {doc_label}")
    if kb_name:
        meta_parts.append(f"Knowledge Base: {kb_name}")
    if org_name:
        meta_parts.append(f"Organization: {org_name}")
    if description:
        meta_parts.append(f"Summary Description: {description}")

    meta_block = "\n".join(meta_parts) if meta_parts else ""

    logger.info(
        "ingestion.contextual_enrichment.started",
        doc_title=doc_title,
        doc_type=doc_type,
        topic=topic,
        chunk_count=len(chunks),
        overview_chars=len(doc_overview),
    )

    sem = asyncio.Semaphore(max_concurrent)
    completed_count = 0
    total_cost_usd = 0.0
    total_chunks = len(chunks)

    async def _wrapped_enrich(c: Chunk) -> Chunk:
        nonlocal completed_count, total_cost_usd
        chunk, cost = await _enrich_single_chunk(doc_title, meta_block, doc_overview, c, sem)
        completed_count += 1
        total_cost_usd += cost

        if progress_cb:
            elapsed = max(0.1, time.monotonic() - started)
            rate = completed_count / elapsed
            remaining = total_chunks - completed_count
            eta_sec = int(remaining / rate) if rate > 0 else 0
            try:
                if asyncio.iscoroutinefunction(progress_cb):
                    await progress_cb(completed_count, total_chunks, total_cost_usd, eta_sec)
                else:
                    progress_cb(completed_count, total_chunks, total_cost_usd, eta_sec)
            except Exception:
                pass
        return chunk

    tasks = [_wrapped_enrich(c) for c in chunks]
    enriched_chunks = await asyncio.gather(*tasks, return_exceptions=False)
    elapsed = time.monotonic() - started

    logger.info(
        "ingestion.contextual_enrichment.completed",
        doc_title=doc_title,
        chunk_count=len(enriched_chunks),
        total_cost_usd=round(total_cost_usd, 6),
        duration_s=round(elapsed, 2),
    )

    return list(enriched_chunks), total_cost_usd


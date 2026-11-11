"""
Context enrichment — attach 'filename > section:' context to chunk text.

Two entry points with very different timing:

  enrich_for_prompt(text, filename, section)
      Pure, non-mutating. Builds the enriched string for PROMPT ASSEMBLY /
      display, from metadata already stored alongside the chunk. Preferred:
      keeps the embedded vector clean while still giving the LLM document +
      section context at read time.

  apply_context_enriched(chunks, filename)
      Legacy EMBED-time mutation — bakes the prefix into Chunk.text so it lands
      in the vector. Off by default (ChunkConfig.context_enriched=False) because
      a constant filename prefix biases a document's vectors together and makes
      queries (which have no prefix) asymmetric. Kept for opt-in use only.
"""

from __future__ import annotations

from typing import List

from app.orchestra.ai.core.document_models import Chunk
from app.orchestra.ai.config import ChunkConfig, get_chunk_config as get_config
from app.orchestra.ai.ingestion.chunking.sizing import fits, token_count


def enrich_for_prompt(text: str, filename: str, section: str = "", page: int = 1) -> str:
    """Build '[DOCUMENT BREADCRUMB: filename > section (Page N)]\\n{text}' for prompt/display. Does not mutate."""
    breadcrumb = f"{filename} > {section}" if section else filename
    prefix = f"[DOCUMENT BREADCRUMB: {breadcrumb} (Page {page})]"
    return f"{prefix}\n{text}"


def apply_context_enriched(chunks: List[Chunk], filename: str,
                           config: ChunkConfig | None = None) -> List[Chunk]:
    """Opt-in embed enrichment; trim context only and preserve the evidence budget."""
    cfg = config or get_config(filename)
    prepared = []
    for chunk in chunks:
        if not fits(chunk.text, cfg):
            raise ValueError("Source chunk exceeds budget before context enrichment")
        context = f"{filename} > {chunk.section}" if chunk.section else filename
        context += f" (Page {chunk.page})"
        while context and not fits(f"[DOCUMENT BREADCRUMB: {context}]\n{chunk.text}", cfg):
            context = context[:len(context) * 3 // 4].rstrip()
        text = f"[DOCUMENT BREADCRUMB: {context}]\n{chunk.text}" if context else chunk.text
        prepared.append((chunk, text, bool(context), token_count(text, cfg)))
    # Validate the entire batch before mutating any caller-owned chunks.
    for chunk, text, included, count in prepared:
        chunk.text = text
        chunk.metadata.update(token_count=count, tokenizer=cfg.tokenizer_name,
                              context_prefix_omitted=not included)
    return chunks

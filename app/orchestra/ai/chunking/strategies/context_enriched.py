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

from app.rag.document_parser import Chunk


def enrich_for_prompt(text: str, filename: str, section: str = "", page: int = 1) -> str:
    """Build '[DOCUMENT BREADCRUMB: filename > section (Page N)]\\n{text}' for prompt/display. Does not mutate."""
    breadcrumb = f"{filename} > {section}" if section else filename
    prefix = f"[DOCUMENT BREADCRUMB: {breadcrumb} (Page {page})]"
    return f"{prefix}\n{text}"


def apply_context_enriched(chunks: List[Chunk], filename: str) -> List[Chunk]:
    """Embed-time mutation (opt-in). Prepends breadcrumb context into Chunk.text in place."""
    for c in chunks:
        c.text = enrich_for_prompt(c.text, filename, c.section, c.page)
    return chunks

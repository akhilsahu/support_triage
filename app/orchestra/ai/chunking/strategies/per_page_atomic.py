from __future__ import annotations

import re
from typing import List

from app.rag.document_parser import Chunk, ParsedDocument
from app.orchestra.ai.chunking.config import ChunkConfig


def chunk_per_page_atomic(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """One ParsedPage = one Chunk. No splitting. Used for vision/image pages."""
    chunks: List[Chunk] = []
    for idx, p in enumerate(doc.pages):
        text = re.sub(r"[ \t]+", " ", p.text).strip()
        if not text:
            continue
        # Cap long vision output at sentence boundary
        if cfg.chunk_size and len(text) > cfg.chunk_size:
            text = _truncate_at_sentence(text, cfg.chunk_size)
        chunks.append(Chunk(text=text, page=p.page, chunk_index=idx, section=p.section))
    return chunks


def _truncate_at_sentence(text: str, limit: int) -> str:
    truncated = text[:limit]
    for sep in (". ", ".\n", "! ", "? "):
        pos = truncated.rfind(sep)
        if pos > limit * 0.7:
            return truncated[:pos + 1].strip()
    return truncated.strip()

from __future__ import annotations

from typing import List

from app.rag.document_parser import Chunk, ParsedDocument
from app.orchestra.ai.chunking.config import ChunkConfig


def chunk_line_atomic(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """One line = one Chunk. Used for JSONL where each line is a complete JSON object."""
    chunks: List[Chunk] = []
    idx = 0
    for p in doc.pages:
        for line in p.text.splitlines():
            line = line.strip()
            if line:
                chunks.append(Chunk(text=line, page=p.page, chunk_index=idx, section=p.section))
                idx += 1
    return chunks

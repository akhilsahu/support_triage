from __future__ import annotations

from typing import List

from app.orchestra.ai.core.document_models import Chunk, ParsedDocument
from app.orchestra.ai.config import ChunkConfig
from app.orchestra.ai.ingestion.chunking.sizing import joined_pages, logical_chunk


def chunk_per_page_atomic(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """Keep page provenance; the shared finalizer splits oversized vision text."""
    chunks: List[Chunk] = []
    for idx, p in enumerate(doc.pages):
        text, segments = joined_pages([(idx, p)])
        if not text.strip():
            continue
        chunks.append(logical_chunk(text, p.page, p.section, metadata=p.metadata, segments=segments))
    return chunks

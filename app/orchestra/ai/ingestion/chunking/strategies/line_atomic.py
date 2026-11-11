from __future__ import annotations

from typing import List

from app.orchestra.ai.core.document_models import Chunk, ParsedDocument
from app.orchestra.ai.config import ChunkConfig
from app.orchestra.ai.ingestion.chunking.sizing import logical_chunk


def chunk_line_atomic(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """Keep parser-identified records intact; raw legacy inputs fall back to lines."""
    chunks: List[Chunk] = []
    for fragment, p in enumerate(doc.pages):
        if "record_index" in p.metadata or (doc.extension == ".jsonl" and p.section.startswith("Record ")):
            if p.text.strip():
                chunks.append(logical_chunk(
                    p.text, p.page, p.section,
                    metadata={**p.metadata, "record_index": p.metadata.get("record_index", fragment),
                              "block_type": "record", "split_mode": "record"},
                    segments=[{"start": 0, "end": len(p.text), "page": p.page,
                               "page_fragment": fragment, "source_start": 0}],
                ))
            continue
        offset = 0
        for record, line in enumerate(p.text.splitlines(keepends=True)):
            if line.strip():
                chunks.append(logical_chunk(
                    line, p.page, p.section,
                    metadata={**p.metadata, "record_index": record},
                    segments=[{"start": 0, "end": len(line), "page": p.page,
                               "page_fragment": fragment, "source_start": offset}],
                ))
            offset += len(line)
    return chunks

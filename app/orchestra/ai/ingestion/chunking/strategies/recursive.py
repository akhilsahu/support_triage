"""Recursive document chunks with exact page-fragment source locations."""
from __future__ import annotations

from app.orchestra.ai.core.document_models import ParsedDocument
from app.orchestra.ai.config import ChunkConfig
from app.orchestra.ai.ingestion.chunking.sizing import joined_pages, logical_chunk, spans


def chunk_recursive(doc: ParsedDocument, cfg: ChunkConfig):
    groups = []
    for fragment, page in enumerate(doc.pages):
        if not page.text.strip():
            continue
        previous = groups[-1][-1][1] if groups else None
        record = "record_index" in page.metadata or doc.extension in (".json", ".jsonl")
        if (previous is not None and not record and not page.is_table and not previous.is_table
                and page.metadata.get("block_type") != "code"
                and previous.metadata.get("block_type") != "code"
                and page.section == previous.section and page.metadata == previous.metadata):
            groups[-1].append((fragment, page))
        else:
            groups.append([(fragment, page)])
    chunks = []
    for pages in groups:
        page = pages[0][1]
        body, segments = joined_pages(pages)
        metadata = dict(page.metadata)
        if "record_index" in metadata or doc.extension in (".json", ".jsonl"):
            metadata.update(record_index=metadata.get("record_index", pages[0][0]),
                            block_type="record", split_mode="record")
        chunks.append(logical_chunk(body, page.page, page.section, metadata=metadata,
                                    is_table=page.is_table, segments=segments))
    return chunks


def split_recursive(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Compatibility helper; preserves source characters and bounds overlap."""
    cfg = ChunkConfig(chunk_size=chunk_size, overlap=overlap, min_chunk_size=0)
    return [text[start:end] for start, end, _, _ in spans(text, cfg) if text[start:end].strip()]

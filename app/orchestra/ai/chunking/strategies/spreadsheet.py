from __future__ import annotations

from typing import List

from app.rag.document_parser import Chunk, ParsedDocument
from app.orchestra.ai.chunking.config import ChunkConfig


def chunk_spreadsheet(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """
    Spreadsheet-aware chunking:
      - Never splits a row across chunks
      - Repeats the header row at the top of every chunk
      - Handles the 'Sheet: name' label line produced by XlsxParser
    """
    chunks: List[Chunk] = []
    idx = 0

    for p in doc.pages:
        text = p.text.strip()
        if not text:
            continue

        lines = text.splitlines()
        if not lines:
            continue

        # Strip optional label line ("Sheet: name" from XlsxParser)
        label = ""
        start = 0
        if lines[0].lower().startswith("sheet:"):
            label = lines[0]
            start = 1

        if start >= len(lines):
            continue

        # First non-label line is the header row
        header = lines[start]
        data_lines = [ln for ln in lines[start + 1:] if ln.strip()]

        # Caption (section + column/row labels, or LLM) so conceptual queries
        # match. Mode via settings.TABLE_CAPTION_MODE.
        from app.orchestra.ai.chunking.strategies.table_caption import caption_for_table
        caption = caption_for_table(header, label or p.section)
        cap_prefix = (caption + "\n") if caption else ""

        if not data_lines:
            body = cap_prefix + (label + "\n" if label else "") + header
            chunks.append(Chunk(text=body, page=p.page, chunk_index=idx, section=p.section))
            idx += 1
            continue

        header_prefix = cap_prefix + (label + "\n" if label else "") + header
        current: List[str] = []
        current_size = len(header_prefix)

        def _flush():
            nonlocal idx
            if not current:
                return
            chunk_text = header_prefix + "\n" + "\n".join(current)
            chunks.append(Chunk(text=chunk_text, page=p.page, chunk_index=idx, section=p.section))
            idx += 1

        for row in data_lines:
            row_size = len(row) + 1  # +1 for newline
            if cfg.chunk_size and current and current_size + row_size > cfg.chunk_size:
                _flush()
                current = []
                current_size = len(header_prefix)
            current.append(row)
            current_size += row_size

        _flush()

    return chunks

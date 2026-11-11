"""Section-aware logical groups; final sizing preserves all source content."""
from __future__ import annotations

from app.orchestra.ai.config import ChunkConfig
from app.orchestra.ai.ingestion.chunking.sizing import joined_pages, logical_chunk, subsegments
from app.orchestra.ai.ingestion.chunking.strategies.table_rows import fenced_code_spans, split_table_rows, table_blocks
from app.orchestra.ai.core.document_models import ParsedDocument


def chunk_by_structure(doc: ParsedDocument, cfg: ChunkConfig):
    groups = []
    for fragment, page in enumerate(doc.pages):
        if not page.text.strip():
            continue
        isolated = (page.is_table or page.metadata.get("block_type") in ("table", "code")
                    or bool(table_blocks(page.text)) or bool(fenced_code_spans(page.text)))
        previous = groups[-1][-1][1] if groups else None
        # Different metadata can identify different assets/records. Keep it local
        # rather than copying only the first fragment's metadata into the group.
        if (previous is not None and not isolated and not previous.is_table
                and previous.metadata.get("block_type") not in ("table", "code")
                and not table_blocks(previous.text) and not fenced_code_spans(previous.text)
                and previous.section == page.section and previous.metadata == page.metadata):
            groups[-1].append((fragment, page))
        else:
            groups.append([(fragment, page)])
    chunks = []
    for pages in groups:
        first = pages[0][1]
        body, segments = joined_pages(pages)
        section = first.section.strip()
        metadata = dict(first.metadata or {})
        prefix = section + "\n" if cfg.keep_section_header and section else ""
        if metadata.get("block_type") == "code":
            chunks.append(logical_chunk(body, first.page, section,
                                        metadata={**metadata, "split_mode": "lines"},
                                        prefix=prefix, segments=segments))
            continue
        cursor = 0
        for start, end in fenced_code_spans(body):
            if body[cursor:start].strip():
                chunks.extend(chunk_tables(body[cursor:start], subsegments(segments, cursor, start),
                                           first.page, section, metadata, cfg,
                                           is_table=first.is_table or metadata.get("block_type") == "table"))
            chunks.append(logical_chunk(body[start:end], first.page, section,
                                        metadata={**metadata, "block_type": "code", "split_mode": "lines"},
                                        prefix=prefix, segments=subsegments(segments, start, end)))
            cursor = end
        if body[cursor:].strip():
            chunks.extend(chunk_tables(body[cursor:], subsegments(segments, cursor, len(body)),
                                       first.page, section, metadata, cfg,
                                       is_table=first.is_table or metadata.get("block_type") == "table"))
    return chunks


def chunk_tables(body, segments, page, section, metadata, cfg, *, is_table=True):
    """Keep each table/header independent, including tables inside Markdown."""
    chunks = []
    prefix = section + "\n" if cfg.keep_section_header and section else ""
    from app.orchestra.ai.ingestion.chunking.strategies.table_caption import caption_for_table
    blocks = table_blocks(body)
    text_type = metadata.get("block_type") or "text"
    if text_type in ("table", "code"):
        text_type = "text"
    prose_metadata = {**metadata, "block_type": text_type, "split_mode": "prose"}
    cursor = 0
    for table in blocks:
        if body[cursor:table.start].strip():
            chunks.append(logical_chunk(
                body[cursor:table.start], page, section, metadata=prose_metadata,
                prefix=prefix, segments=subsegments(segments, cursor, table.start)))
        source = body[table.start:table.end]
        caption = caption_for_table(source, section, mode=cfg.table_caption_mode)
        chunks.append(logical_chunk(
            source, page, section, is_table=True,
            metadata={**metadata, "block_type": "table", "split_mode": "rows",
                      "table_id": _table_id(segments, table.start)},
            prefix=caption + "\n" if caption else prefix,
            repeat=body[table.start:table.header_end],
            segments=subsegments(segments, table.start, table.end)))
        cursor = table.end
    if body[cursor:].strip():
        tail_metadata = {**metadata, "block_type": "table" if is_table and not blocks else text_type,
                         "split_mode": "rows" if is_table and not blocks else "prose"}
        if is_table and not blocks:
            # Some parsers emit plain pipe-delimited tables without a declared
            # header. Retain all text, but never invent a header from row one.
            tail_metadata.update(table_id=metadata.get("table_id") or _table_id(segments, cursor),
                                 table_header_unknown=True)
        chunks.append(logical_chunk(
            body[cursor:], page, section, is_table=is_table and not blocks,
            metadata=tail_metadata,
            prefix=prefix, segments=subsegments(segments, cursor, len(body))))

    if cfg.table_row_chunks:
        for row in split_table_rows(body, section, max_rows=cfg.table_row_max,
                                    wide_cols=cfg.table_row_wide_cols, group_size=cfg.table_row_group):
            row_segments = []
            position = 0
            for start, end in row.source_spans:
                for segment in subsegments(segments, start, end):
                    row_segments.append({**segment, "start": segment["start"] + position,
                                         "end": segment["end"] + position})
                position += end - start
            first_span = row.source_spans[0]
            chunks.append(logical_chunk(
                row.text, page, section, is_table=True, is_table_row=True,
                row_label=row.label,
                metadata={**metadata, "block_type": "table", "split_mode": "rows",
                          "table_id": _table_id(segments, row.source_spans[0][0])}, prefix=prefix,
                repeat=body[first_span[0]:first_span[1]], segments=row_segments))
    return chunks


def _table_id(segments, start):
    """Document-local table identity shared by whole-table and lookup chunks."""
    for segment in segments:
        if segment["start"] <= start < segment["end"]:
            return f"{segment['page_fragment']}:{segment['source_start'] + start - segment['start']}"
    return f"offset:{start}"

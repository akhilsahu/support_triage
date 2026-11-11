"""Spreadsheet chunks with repeated source headers and bounded row fragments."""
from __future__ import annotations

from app.orchestra.ai.core.document_models import ParsedDocument
from app.orchestra.ai.config import ChunkConfig
from app.orchestra.ai.ingestion.chunking.sizing import joined_pages, logical_chunk


def chunk_spreadsheet(doc: ParsedDocument, cfg: ChunkConfig):
    chunks = []
    for fragment, page in enumerate(doc.pages):
        body, segments = joined_pages([(fragment, page)])
        if not body.strip():
            continue
        metadata = dict(page.metadata)
        if "_header_span" in metadata or "_row_spans" in metadata:
            header_span, row_spans = metadata.get("_header_span"), metadata.get("_row_spans")
            header_end = header_span.get("end") if isinstance(header_span, dict) else None
            if (not isinstance(header_span, dict) or header_span.get("start") != 0 or type(header_end) is not int
                    or not 0 <= header_end <= len(body) or not isinstance(row_spans, list)):
                raise ValueError("Invalid spreadsheet header/row spans")
            cursor = header_end
            previous_row = 0
            boundaries = [0, header_end]
            for row in row_spans:
                if (not isinstance(row, dict) or type(row.get("start")) is not int
                        or type(row.get("end")) is not int or type(row.get("row_index")) is not int
                        or row["row_index"] <= previous_row
                        or row["start"] != cursor or not cursor <= row["end"] <= len(body)):
                    raise ValueError("Invalid spreadsheet row span")
                cursor = row["end"]
                previous_row = row["row_index"]
                boundaries.append(cursor)
            if cursor != len(body):
                raise ValueError("Spreadsheet row spans do not cover the source")
            header = body[:header_end]
            metadata.update(_unit_boundaries=boundaries, row_boundary_source="parser")
        else:
            # Compatibility for older cached documents/custom parsers.
            lines = body.splitlines(keepends=True)
            header_count = 2 if lines[0].lower().startswith("sheet:") else 1
            header = "".join(lines[:header_count])
            metadata["row_boundary_source"] = "newline_fallback"
        chunks.append(logical_chunk(body, page.page, page.section,
                                    metadata={**metadata, "row_aware": True, "split_mode": "rows"},
                                    segments=segments, repeat=header,
                                    prefix=f"{page.section}\n" if cfg.keep_section_header and page.section else ""))
    return chunks

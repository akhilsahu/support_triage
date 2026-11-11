"""Shared table serialization with exact header and logical-row offsets."""
from app.orchestra.ai.core.document_models import ParsedPage


def table_page(*, page: int, header: str, rows: list[tuple[int, str]],
               section: str = "", preamble: str = "", table_id: str = "") -> ParsedPage:
    """Keep embedded cell newlines verbatim; offsets refer to serialized text."""
    text = (preamble + "\n" if preamble else "") + header
    if rows:
        text += "\n"
    header_end = len(text)
    spans = []
    parts = [text]
    offset = header_end
    for position, (row_index, row) in enumerate(rows):
        part = row + ("\n" if position + 1 < len(rows) else "")
        spans.append({"start": offset, "end": offset + len(part), "row_index": row_index})
        parts.append(part)
        offset += len(part)
    return ParsedPage(
        page=page, text="".join(parts), section=section, is_table=True,
        metadata={"block_type": "table", "table_id": table_id or f"page:{page}",
                  "_header_span": {"start": 0, "end": header_end}, "_row_spans": spans},
    )

"""JsonCsvParser — JSON / JSONL / CSV — structured-data extraction with source metadata."""

from __future__ import annotations

from pathlib import Path

import csv
import io
import json
from typing import List

import structlog

from app.orchestra.ai.core.document_models import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.text_utils import decode_text
from app.orchestra.ai.ingestion.core.base import BaseParser
from app.orchestra.ai.ingestion.parsers.table_text import table_page


class JsonCsvParser(BaseParser):
    extensions = [".json", ".jsonl", ".csv"]

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        ext = Path(filename).suffix.lower()
        if ext == ".csv":
            return _parse_csv(raw, filename)
        return _parse_json(raw, filename)


logger = structlog.get_logger()


def _parse_json(raw: bytes, filename: str) -> ParsedDocument:
    text = decode_text(raw)
    ext = Path(filename).suffix.lower()
    pages: List[ParsedPage] = []

    def record_page(value, index, section, *, valid=True):
        body = _flatten_json(value) if valid else value
        if not body.strip():
            body = json.dumps(value, ensure_ascii=False)
        return ParsedPage(page=index + 1, text=body, section=section,
                          metadata={"record_index": index, "record_format": ext[1:],
                                    "block_type": "record", "record_valid_json": valid})

    if ext == ".jsonl":
        for i, line in enumerate(text.splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                pages.append(record_page(obj, i - 1, f"Record {i}"))
            except json.JSONDecodeError:
                pages.append(record_page(line, i - 1, f"Record {i}", valid=False))
    else:
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid JSON: {e}")
        if isinstance(data, list) and data:
            pages = [record_page(item, i, f"Item {i + 1}") for i, item in enumerate(data)]
        else:
            # A root object is one record: separate keys may describe the same
            # entity. Scalars and empty containers are valid records too.
            pages = [record_page(data, 0, "Record 1")]

    logger.info("JSON parsed", filename=filename, records=len(pages))
    return ParsedDocument(filename=filename, extension=ext, pages=pages)

def _flatten_json(obj, prefix: str = "", sep: str = " → ") -> str:
    lines = []
    if isinstance(obj, (dict, list)) and not obj:
        value = json.dumps(obj)
        return f"{prefix}: {value}" if prefix else value
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}{sep}{k}" if prefix else k
            if isinstance(v, (dict, list)):
                lines.append(_flatten_json(v, key, sep))
            else:
                lines.append(f"{key}: {v}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            lines.append(_flatten_json(item, f"{prefix}[{i}]", sep))
    else:
        lines.append(str(obj))
    return "\n".join(lines)

def _parse_csv(raw: bytes, filename: str) -> ParsedDocument:
    text = decode_text(raw)
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    if not rows:
        return ParsedDocument(filename=filename, extension=".csv", pages=[])

    headers = rows[0]
    pages: List[ParsedPage] = []
    data_rows = rows[1:]
    # Keep the existing 50-row batching, with positions from csv.reader rather
    # than newline counting (quoted cells may contain embedded newlines).
    for start in range(0, max(1, len(data_rows)), 50):
        batch = [(start + i + 1, " | ".join(row)) for i, row in enumerate(data_rows[start:start + 50])]
        section = f"Rows {start + 1}–{start + len(batch)}" if batch else "Header"
        pages.append(table_page(page=len(pages) + 1, header=" | ".join(headers),
                                rows=batch, section=section, table_id="csv"))

    logger.info("CSV parsed", filename=filename, rows=len(rows) - 1, pages=len(pages))
    return ParsedDocument(
        filename=filename, extension=".csv", pages=pages,
        metadata={"row_count": len(rows) - 1, "columns": headers}
    )

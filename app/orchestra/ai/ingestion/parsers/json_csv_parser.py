"""JsonCsvParser — JSON / JSONL / CSV — delegates to existing document_parser helpers."""

from __future__ import annotations

from pathlib import Path

from app.rag.document_parser import ParsedDocument, _parse_json, _parse_csv  # type: ignore[attr-defined]
from app.orchestra.ai.ingestion.core.base import BaseParser


class JsonCsvParser(BaseParser):
    extensions = [".json", ".jsonl", ".csv"]

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        ext = Path(filename).suffix.lower()
        if ext == ".csv":
            return _parse_csv(raw, filename)
        return _parse_json(raw, filename)

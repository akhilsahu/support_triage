"""TextParser — .txt / .md / .rst — delegates to the existing document_parser helpers."""

from __future__ import annotations

from app.rag.document_parser import ParsedDocument, _parse_text  # type: ignore[attr-defined]
from app.orchestra.ai.ingestion.core.base import BaseParser


class TextParser(BaseParser):
    extensions = [".txt", ".md", ".rst"]

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        return _parse_text(raw, filename)

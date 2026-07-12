"""
PyPdfParser — lightweight PDF fallback using pypdf (no native dependencies).

Used as the second entry in PARSER_MAP[".pdf"] chain.
Invoked automatically by the service when PdfParser (PyMuPDF) raises ImportError.

No table detection, no heading splits, no vision — plain text extraction only.
Adequate for simple text PDFs; use PdfParser for production-grade accuracy.
"""

from __future__ import annotations

import io
from typing import List

import structlog

from app.rag.document_parser import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.base import BaseParser

logger = structlog.get_logger()


class PyPdfParser(BaseParser):
    extensions = [".pdf"]

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        import pypdf  # raises ImportError if not installed
        reader = pypdf.PdfReader(io.BytesIO(raw))
        pages: List[ParsedPage] = []
        for i, page in enumerate(reader.pages, 1):
            text = (page.extract_text() or "").strip()
            if text:
                pages.append(ParsedPage(page=i, text=text))
        meta = {
            "author":     reader.metadata.author if reader.metadata else None,
            "title":      reader.metadata.title  if reader.metadata else None,
            "page_count": len(reader.pages),
        }
        logger.info("ingestion.pdf.pypdf", filename=filename, pages=len(pages))
        return ParsedDocument(filename=filename, extension=".pdf", pages=pages, metadata=meta)

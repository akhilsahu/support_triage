"""
BaseParser — abstract contract every parser must implement.

All parsers return the existing ParsedDocument / ParsedPage types from
app.rag.document_parser so chunking.py needs zero changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import List

from app.rag.document_parser import ParsedDocument
from app.orchestra.ai.ingestion.config import IngestionConfig


class BaseParser(ABC):
    """
    One subclass per document family (PDF, DOCX, XLSX, …).

    Subclasses declare which extensions they handle via `extensions`.
    The registry uses this to route files without any if/elif chains.
    """

    #: List of lowercase extensions this parser handles, e.g. ['.pdf']
    extensions: List[str] = []

    def __init__(self, cfg: IngestionConfig) -> None:
        self.cfg = cfg

    def can_parse(self, filename: str) -> bool:
        ext = Path(filename).suffix.lower()
        return ext in self.extensions and ext in self.cfg.enabled_extensions

    @abstractmethod
    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        """
        Parse raw bytes into a ParsedDocument.

        Args:
            raw:      File bytes.
            filename: Original filename (used for extension + metadata).

        Returns:
            ParsedDocument with per-page/section ParsedPages.

        Raises:
            ValueError:  Unsupported or corrupt file.
            RuntimeError: Required library not installed.
        """
        ...

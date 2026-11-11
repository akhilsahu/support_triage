"""Shared document/evidence models; no parser, storage or application initialization."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class ParsedPage:
    """A logical page or section extracted from a document."""
    page:     int
    text:     str
    section:  str  = ""
    is_table: bool = False  # preserves table structure/header context during chunking
    metadata: dict = field(default_factory=dict)

@dataclass
class ParsedDocument:
    filename: str
    extension: str
    pages: List[ParsedPage] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.text for p in self.pages if p.text.strip())

    @property
    def page_count(self) -> int:
        # PDF parsers may emit several logical ParsedPage fragments for one
        # physical page (prose, table and image text). The parser records the
        # physical count in metadata; presenting len(pages) made a 10-page PDF
        # appear as 29 pages in source status and progress UI.
        physical_count = self.metadata.get("page_count")
        if isinstance(physical_count, int) and physical_count > 0:
            return physical_count
        return len(self.pages)

@dataclass
class Chunk:
    text: str
    page: int
    chunk_index: int
    chunk_id: str = ""
    section: str = ""
    is_table: bool = False
    # Set on the per-row chunks a table is additionally split into. row_label is
    # the row's first cell ("SBI Card PRIME") — it makes a chunk identifiable by
    # what it is about, where chunk ids only say where it sits in the document.
    is_table_row: bool = False
    row_label: str = ""
    # Parser/strategy-specific data which must stay attached to this exact
    # chunk (for example Markdown links and linked images).
    metadata: dict = field(default_factory=dict)
    # Original evidence, excluding generated captions and context breadcrumbs.
    source_text: str = ""

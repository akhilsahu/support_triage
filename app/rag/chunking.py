"""
Chunking — strategy-based document splitter for the RAG pipeline.

Two strategies:
  RECURSIVE    — Recursive character splitting. Best for PDF, TXT, JSON, CSV.
  BY_STRUCTURE — Section-aware splitting. Best for DOCX, HTML, MD where the
                 parser already identified headings via ParsedPage.section.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

import structlog

from app.rag.document_parser import Chunk, ParsedDocument

logger = structlog.get_logger()


class ChunkStrategy(str, Enum):
    RECURSIVE    = "recursive"
    BY_STRUCTURE = "by_structure"


@dataclass
class ChunkConfig:
    strategy:            ChunkStrategy = ChunkStrategy.RECURSIVE
    chunk_size:          int  = 1000
    overlap:             int  = 150
    min_chunk_size:      int  = 80
    keep_section_header: bool = True


# ── Extension → config (shared instances for identical formats) ───────────────

_STRUCT_WIDE  = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE, chunk_size=1200, overlap=120, min_chunk_size=80)
_STRUCT_MED   = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE, chunk_size=1000, overlap=100, min_chunk_size=60)
_STRUCT_SMALL = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE, chunk_size=900,  overlap=100, min_chunk_size=60)
_REC_PDF      = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,    chunk_size=1000, overlap=150, min_chunk_size=80)
_REC_TXT      = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,    chunk_size=900,  overlap=120, min_chunk_size=60)
_REC_JSON     = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,    chunk_size=800,  overlap=80,  min_chunk_size=40)
_REC_CSV      = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,    chunk_size=600,  overlap=0,   min_chunk_size=40)

EXTENSION_CONFIG: Dict[str, ChunkConfig] = {
    ".docx": _STRUCT_WIDE,  ".doc":   _STRUCT_WIDE,
    ".html": _STRUCT_MED,   ".htm":   _STRUCT_MED,
    ".md":   _STRUCT_SMALL, ".rst":   _STRUCT_SMALL,
    ".pdf":  _REC_PDF,
    ".txt":  _REC_TXT,
    ".json": _REC_JSON,     ".jsonl": _REC_JSON,
    ".csv":  _REC_CSV,
}

_DEFAULT_CONFIG = _REC_PDF  # fallback for unknown extensions


def get_config(filename: str) -> ChunkConfig:
    ext = Path(filename).suffix.lower()
    cfg = EXTENSION_CONFIG.get(ext, _DEFAULT_CONFIG)
    logger.debug("chunk_config", filename=filename, ext=ext, strategy=cfg.strategy.value)
    return cfg


# ── Public entry point ────────────────────────────────────────────────────────

def chunk(doc: ParsedDocument, config: Optional[ChunkConfig] = None) -> List[Chunk]:
    """Chunk a ParsedDocument. Uses extension-derived config unless overridden."""
    cfg = config or get_config(doc.filename)
    chunks = (
        _chunk_by_structure(doc, cfg)
        if cfg.strategy == ChunkStrategy.BY_STRUCTURE
        else _chunk_recursive(doc, cfg)
    )
    logger.info("chunking_complete", filename=doc.filename, strategy=cfg.strategy.value, chunks=len(chunks))
    return chunks


# ── BY_STRUCTURE ──────────────────────────────────────────────────────────────

def _chunk_by_structure(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """Group pages by section (merging tiny sections on the fly), then split large ones."""
    groups: List[dict] = []
    for p in doc.pages:
        section = (p.section or "").strip()
        text    = re.sub(r"[ \t]+", " ", p.text).strip()
        if not text:
            continue
        if groups and groups[-1]["section"] == section:
            groups[-1]["texts"].append(text)
            groups[-1]["page_end"] = p.page
        else:
            # Absorb into previous group if it was too small to stand alone
            prev_text = "\n\n".join(groups[-1]["texts"]) if groups else ""
            if groups and len(prev_text) < cfg.min_chunk_size:
                groups[-1]["texts"].append(text)
                groups[-1]["page_end"] = p.page
                groups[-1]["section"] = groups[-1]["section"] or section
            else:
                groups.append({"section": section, "page_start": p.page, "page_end": p.page, "texts": [text]})

    chunks: List[Chunk] = []
    idx = 0
    for g in groups:
        full_text = "\n\n".join(g["texts"]).strip()
        if not full_text:
            continue
        header = g["section"]

        if len(full_text) <= cfg.chunk_size:
            text = f"{header}\n\n{full_text}".strip() if (cfg.keep_section_header and len(header) > 0) else full_text
            chunks.append(Chunk(text=text, page=g["page_start"], chunk_index=idx, section=header))
            idx += 1
        else:
            for piece in _recursive_split(full_text, cfg.chunk_size, cfg.overlap):
                if len(piece) < cfg.min_chunk_size:
                    continue
                text = f"{header}\n\n{piece}".strip() if (cfg.keep_section_header and len(header) > 0) else piece
                chunks.append(Chunk(text=text, page=g["page_start"], chunk_index=idx, section=header))
                idx += 1

    return chunks


# ── RECURSIVE ─────────────────────────────────────────────────────────────────

_SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""]


def _chunk_recursive(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    # Join all pages into one text to avoid tearing sentences at page boundaries.
    # Track a page-number lookup so each chunk still gets the right page.
    combined_parts: List[str] = []
    page_map: List[tuple[int, int]] = []  # (char_start, page_number)
    pos = 0
    for p in doc.pages:
        text = re.sub(r"[ \t]+", " ", p.text).strip()
        if not text:
            continue
        page_map.append((pos, p.page))
        combined_parts.append(text)
        pos += len(text) + 2  # +2 for the \n\n separator

    if not combined_parts:
        return []

    full_text = "\n\n".join(combined_parts)

    def _page_for(char_offset: int) -> int:
        """Return page number for a character offset in full_text."""
        page = page_map[0][1]
        for start, pg in page_map:
            if char_offset >= start:
                page = pg
            else:
                break
        return page

    chunks: List[Chunk] = []
    offset = 0
    for idx, piece in enumerate(_recursive_split(full_text, cfg.chunk_size, cfg.overlap)):
        if len(piece) < cfg.min_chunk_size:
            continue
        page = _page_for(offset)
        chunks.append(Chunk(text=piece, page=page, chunk_index=idx, section=""))
        offset += len(piece)

    return chunks


def _recursive_split(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Split text by separators coarsest-to-finest, then stitch overlap between chunks."""
    def _split(t: str, separators: List[str]) -> List[str]:
        if not t.strip():
            return []
        sep, rest = separators[0], separators[1:]
        good: List[str] = []
        current = ""
        for piece in (t.split(sep) if sep else list(t)):
            candidate = (current + sep + piece).lstrip(sep) if len(current) > 0 else piece
            if len(candidate) <= chunk_size:
                current = candidate
            else:
                if len(current) > 0:
                    good.append(current)
                if len(piece) > chunk_size and rest:
                    good.extend(_split(piece, rest))
                elif piece.strip():
                    current = piece
                else:
                    current = ""
        if current.strip():
            good.append(current)
        return good

    raw = _split(text, _SEPARATORS)

    if overlap == 0:
        return [c.strip() for c in raw if c.strip()]

    # Chain overlap against result[i-1] (the already-overlapped chunk), not raw[i-1].
    result: List[str] = []
    for i, c in enumerate(raw):
        if i == 0:
            result.append(c)
        else:
            tail = result[i - 1][-overlap:]
            result.append(c if c.startswith(tail.lstrip()) else tail.rstrip() + " " + c.lstrip())
    return [c.strip() for c in result if c.strip()]

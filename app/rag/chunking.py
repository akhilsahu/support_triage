"""
Chunking — strategy-based document splitter for the RAG pipeline.

Two strategies:

  RECURSIVE   — Recursive character splitting (coarse → fine separators).
                Best for: PDF, TXT, JSON, CSV — formats with no reliable
                heading hierarchy.

  BY_STRUCTURE — Structure-aware splitting.
                Best for: DOCX, HTML, MD — formats where the parser already
                identified sections/headings via ParsedPage.section.
                Each top-level section becomes its own chunk group; sections
                that are still too large are sub-split with RECURSIVE.

Config is extension-driven.  Override any field per-call.

Usage:
    from app.rag.chunking import get_config, chunk

    config = get_config("report.docx")          # picks BY_STRUCTURE
    chunks = chunk(parsed_doc, config)

    # Or override:
    from app.rag.chunking import ChunkConfig, ChunkStrategy
    chunks = chunk(parsed_doc, ChunkConfig(strategy=ChunkStrategy.RECURSIVE,
                                           chunk_size=800, overlap=100))
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

import structlog

from app.rag.document_parser import Chunk, ParsedDocument, ParsedPage

logger = structlog.get_logger()


# ── Strategy enum ─────────────────────────────────────────────────────────────

class ChunkStrategy(str, Enum):
    RECURSIVE    = "recursive"     # paragraph → sentence → word → char
    BY_STRUCTURE = "by_structure"  # use ParsedPage.section boundaries first


# ── Config ────────────────────────────────────────────────────────────────────

@dataclass
class ChunkConfig:
    """
    Chunking configuration.

    Attributes:
        strategy:       Which splitting algorithm to use.
        chunk_size:     Maximum chunk size in characters.
        overlap:        Characters of overlap between consecutive chunks.
        min_chunk_size: Chunks shorter than this are merged with the next one.
        keep_section_header: Prepend the section heading to every chunk
                             produced from that section (BY_STRUCTURE only).
    """
    strategy: ChunkStrategy = ChunkStrategy.RECURSIVE
    chunk_size: int = 1000
    overlap: int = 150
    min_chunk_size: int = 80
    keep_section_header: bool = True


# ── Extension → config map ────────────────────────────────────────────────────
#
# Add or override entries here to change the default behaviour for any format.

EXTENSION_CONFIG: Dict[str, ChunkConfig] = {
    # Structure-aware — these formats have explicit section/heading info
    ".docx": ChunkConfig(
        strategy=ChunkStrategy.BY_STRUCTURE,
        chunk_size=1200,
        overlap=120,
        min_chunk_size=80,
        keep_section_header=True,
    ),
    ".doc": ChunkConfig(
        strategy=ChunkStrategy.BY_STRUCTURE,
        chunk_size=1200,
        overlap=120,
        min_chunk_size=80,
        keep_section_header=True,
    ),
    ".html": ChunkConfig(
        strategy=ChunkStrategy.BY_STRUCTURE,
        chunk_size=1000,
        overlap=100,
        min_chunk_size=60,
        keep_section_header=True,
    ),
    ".htm": ChunkConfig(
        strategy=ChunkStrategy.BY_STRUCTURE,
        chunk_size=1000,
        overlap=100,
        min_chunk_size=60,
        keep_section_header=True,
    ),
    ".md": ChunkConfig(
        strategy=ChunkStrategy.BY_STRUCTURE,
        chunk_size=900,
        overlap=100,
        min_chunk_size=60,
        keep_section_header=True,
    ),
    ".rst": ChunkConfig(
        strategy=ChunkStrategy.BY_STRUCTURE,
        chunk_size=900,
        overlap=100,
        min_chunk_size=60,
        keep_section_header=True,
    ),

    # Recursive — no inherent structure beyond paragraphs
    ".pdf": ChunkConfig(
        strategy=ChunkStrategy.RECURSIVE,
        chunk_size=1000,
        overlap=150,
        min_chunk_size=80,
    ),
    ".txt": ChunkConfig(
        strategy=ChunkStrategy.RECURSIVE,
        chunk_size=900,
        overlap=120,
        min_chunk_size=60,
    ),
    ".json": ChunkConfig(
        strategy=ChunkStrategy.RECURSIVE,
        chunk_size=800,
        overlap=80,
        min_chunk_size=40,
    ),
    ".jsonl": ChunkConfig(
        strategy=ChunkStrategy.RECURSIVE,
        chunk_size=800,
        overlap=80,
        min_chunk_size=40,
    ),
    ".csv": ChunkConfig(
        strategy=ChunkStrategy.RECURSIVE,
        chunk_size=600,
        overlap=0,       # rows shouldn't overlap
        min_chunk_size=40,
    ),
}

# Fallback for any extension not in the map
_DEFAULT_CONFIG = ChunkConfig(
    strategy=ChunkStrategy.RECURSIVE,
    chunk_size=1000,
    overlap=150,
    min_chunk_size=80,
)


def get_config(filename: str) -> ChunkConfig:
    """Return the ChunkConfig for a given filename based on its extension."""
    ext = Path(filename).suffix.lower()
    cfg = EXTENSION_CONFIG.get(ext, _DEFAULT_CONFIG)
    logger.debug(
        "Chunk config selected",
        filename=filename,
        extension=ext,
        strategy=cfg.strategy.value,
        chunk_size=cfg.chunk_size,
        overlap=cfg.overlap,
    )
    return cfg


# ── Public entry point ────────────────────────────────────────────────────────

def chunk(doc: ParsedDocument, config: Optional[ChunkConfig] = None) -> List[Chunk]:
    """
    Chunk a ParsedDocument according to config (or the extension-derived default).

    Args:
        doc:    A ParsedDocument produced by document_parser.parse().
        config: Optional override. If None, get_config(doc.filename) is used.

    Returns:
        List[Chunk] with text, page, chunk_index, section populated.
    """
    cfg = config or get_config(doc.filename)

    if cfg.strategy == ChunkStrategy.BY_STRUCTURE:
        chunks = _chunk_by_structure(doc, cfg)
    else:
        chunks = _chunk_recursive(doc, cfg)

    logger.info(
        "Chunking complete",
        filename=doc.filename,
        strategy=cfg.strategy.value,
        pages=doc.page_count,
        chunks=len(chunks),
    )
    return chunks


# ── BY_STRUCTURE ──────────────────────────────────────────────────────────────

def _chunk_by_structure(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """
    Group ParsedPages by section heading.

    Each distinct section becomes a chunk group.  If a section's text
    exceeds cfg.chunk_size it is sub-split with the recursive splitter.
    Sections shorter than cfg.min_chunk_size are merged with the next section.
    """
    # 1. Group pages by section
    groups: List[dict] = []  # [{section, page, texts}]
    for p in doc.pages:
        section = (p.section or "").strip()
        if groups and groups[-1]["section"] == section:
            groups[-1]["texts"].append(p.text)
            groups[-1]["page_end"] = p.page
        else:
            groups.append({
                "section": section,
                "page_start": p.page,
                "page_end": p.page,
                "texts": [p.text],
            })

    # 2. Merge tiny sections into previous
    merged: List[dict] = []
    for g in groups:
        full = "\n\n".join(t for t in g["texts"] if t.strip())
        if merged and len(full) < cfg.min_chunk_size:
            merged[-1]["texts"].extend(g["texts"])
            merged[-1]["page_end"] = g["page_end"]
            merged[-1]["section"] = merged[-1]["section"] or g["section"]
        else:
            merged.append(g)

    # 3. Split each group into chunks
    chunks: List[Chunk] = []
    idx = 0
    for g in merged:
        full_text = "\n\n".join(t for t in g["texts"] if t.strip()).strip()
        if not full_text:
            continue

        header = g["section"]

        if len(full_text) <= cfg.chunk_size:
            # Whole section fits in one chunk
            text = f"{header}\n\n{full_text}".strip() if (cfg.keep_section_header and header) else full_text
            chunks.append(Chunk(text=text, page=g["page_start"], chunk_index=idx, section=header))
            idx += 1
        else:
            # Section too large — sub-split with recursive splitter
            pieces = _recursive_split(full_text, cfg.chunk_size, cfg.overlap)
            for piece in pieces:
                if len(piece) < cfg.min_chunk_size:
                    continue
                text = f"{header}\n\n{piece}".strip() if (cfg.keep_section_header and header) else piece
                chunks.append(Chunk(text=text, page=g["page_start"], chunk_index=idx, section=header))
                idx += 1

    return chunks


# ── RECURSIVE ─────────────────────────────────────────────────────────────────

_SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""]


def _chunk_recursive(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """Apply recursive character splitting to each ParsedPage."""
    chunks: List[Chunk] = []
    idx = 0

    for p in doc.pages:
        text = re.sub(r"[ \t]+", " ", p.text).strip()
        if not text:
            continue

        pieces = _recursive_split(text, cfg.chunk_size, cfg.overlap)
        for piece in pieces:
            if len(piece) < cfg.min_chunk_size:
                continue
            chunks.append(Chunk(text=piece, page=p.page, chunk_index=idx, section=p.section))
            idx += 1

    return chunks


def _recursive_split(text: str, chunk_size: int, overlap: int) -> List[str]:
    """
    Recursive character splitter.

    Tries separators from coarsest to finest.  Produces pieces whose
    character length is <= chunk_size; carries `overlap` chars forward.
    """
    def _split(text: str, separators: List[str]) -> List[str]:
        if not text.strip():
            return []
        sep, rest = separators[0], separators[1:]
        splits = text.split(sep) if sep else list(text)
        good: List[str] = []
        current = ""

        for piece in splits:
            candidate = (current + sep + piece).lstrip(sep) if current else piece
            if len(candidate) <= chunk_size:
                current = candidate
            else:
                if current:
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

    # Apply overlap
    result: List[str] = []
    for i, chunk in enumerate(raw):
        if i == 0 or overlap == 0:
            result.append(chunk)
        else:
            tail = raw[i - 1][-overlap:]
            if not chunk.startswith(tail.lstrip()):
                result.append(tail.rstrip() + " " + chunk.lstrip())
            else:
                result.append(chunk)

    return [c.strip() for c in result if c.strip()]

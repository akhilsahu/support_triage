"""
Chunking strategy config for Agno knowledge base ingestion.

Strategies available:
  FIXED      — splits at fixed character count, no regard for boundaries
  PARAGRAPH  — splits on blank lines / paragraph markers
  SEMANTIC   — respects sentence boundaries (PDF, DOCX)
  CODE       — splits on function/class definitions
  RECURSIVE  — tries separators in order (paragraphs → sentences → words)
               until chunk fits target size. Best general-purpose strategy.

Recursive chunking is the default for most text types — it produces
cleaner chunks by respecting natural language boundaries rather than
slicing mid-sentence like FIXED does.

Why recursive beats fixed for RAG:
  FIXED:     "...end of para. Start of ne" + "xt paragraph continues here..."
  RECURSIVE: "...end of paragraph."        + "Next paragraph continues here..."
  Semantic search works significantly better on complete thoughts.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional
import re


class ChunkStrategy(str, Enum):
    FIXED     = "fixed"
    PARAGRAPH = "paragraph"
    SEMANTIC  = "semantic"
    CODE      = "code"
    RECURSIVE = "recursive"   # ← new default for prose content


@dataclass
class ChunkConfig:
    strategy:   ChunkStrategy
    chunk_size: int           # characters (not tokens — avoids tokenizer dep)
    overlap:    int
    separators: List[str] = field(default_factory=list)  # for RECURSIVE only


# Recursive separator hierarchy — tried in order, fall through on failure
_RECURSIVE_SEPARATORS = [
    "\n\n",     # paragraph break          (try first)
    "\n",       # line break
    ". ",       # sentence end
    "! ",
    "? ",
    "; ",       # clause break
    ", ",       # phrase break
    " ",        # word break               (last resort)
    "",         # character split          (absolute fallback)
]

_CODE_SEPARATORS = [
    "\nclass ",
    "\ndef ",
    "\nasync def ",
    "\n\n",
    "\n",
    " ",
    "",
]


# Extension → strategy + sizes
# RECURSIVE is default for all prose (md, txt, html, pdf, docx)
# FIXED for structured data (csv, json) — no natural language to respect
_EXTENSION_MAP: dict[str, ChunkConfig] = {
    ".pdf":  ChunkConfig(ChunkStrategy.RECURSIVE, chunk_size=800,  overlap=120, separators=_RECURSIVE_SEPARATORS),
    ".docx": ChunkConfig(ChunkStrategy.RECURSIVE, chunk_size=800,  overlap=120, separators=_RECURSIVE_SEPARATORS),
    ".md":   ChunkConfig(ChunkStrategy.RECURSIVE, chunk_size=600,  overlap=80,  separators=_RECURSIVE_SEPARATORS),
    ".html": ChunkConfig(ChunkStrategy.RECURSIVE, chunk_size=600,  overlap=80,  separators=_RECURSIVE_SEPARATORS),
    ".txt":  ChunkConfig(ChunkStrategy.RECURSIVE, chunk_size=500,  overlap=60,  separators=_RECURSIVE_SEPARATORS),
    ".csv":  ChunkConfig(ChunkStrategy.FIXED,     chunk_size=300,  overlap=0),
    ".json": ChunkConfig(ChunkStrategy.FIXED,     chunk_size=400,  overlap=0),
    ".py":   ChunkConfig(ChunkStrategy.CODE,      chunk_size=500,  overlap=50,  separators=_CODE_SEPARATORS),
    ".js":   ChunkConfig(ChunkStrategy.CODE,      chunk_size=500,  overlap=50,  separators=_CODE_SEPARATORS),
    ".ts":   ChunkConfig(ChunkStrategy.CODE,      chunk_size=500,  overlap=50,  separators=_CODE_SEPARATORS),
}

_DEFAULT = ChunkConfig(ChunkStrategy.RECURSIVE, chunk_size=500, overlap=60, separators=_RECURSIVE_SEPARATORS)


def get_chunk_config(filename: str) -> ChunkConfig:
    """Return chunking config based on file extension."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _EXTENSION_MAP.get(ext, _DEFAULT)


def recursive_split(text: str, cfg: ChunkConfig) -> List[str]:
    """
    Pure-Python recursive character splitter — no LangChain dependency.

    Tries each separator in cfg.separators in order. If a split produces
    chunks larger than chunk_size, recursively splits those using the
    next separator down the hierarchy.

    Args:
        text: Raw text to split
        cfg:  ChunkConfig with chunk_size, overlap, separators

    Returns:
        List of text chunks with overlap applied between consecutive chunks.
    """
    separators = cfg.separators or _RECURSIVE_SEPARATORS
    return _split_recursive(text, separators, cfg.chunk_size, cfg.overlap)


def _split_recursive(
    text: str,
    separators: List[str],
    chunk_size: int,
    overlap: int,
) -> List[str]:
    if not text.strip():
        return []

    # Already fits — no split needed
    if len(text) <= chunk_size:
        return [text.strip()]

    # Try each separator in order
    for i, sep in enumerate(separators):
        if sep == "":
            # Last resort — hard character split
            return _hard_split(text, chunk_size, overlap)

        if sep not in text:
            continue

        parts = text.split(sep)
        remaining_seps = separators[i + 1:]

        # Merge small parts together before recursing
        chunks: List[str] = []
        current = ""

        for part in parts:
            candidate = (current + sep + part).strip() if current else part.strip()

            if len(candidate) <= chunk_size:
                current = candidate
            else:
                # Flush current
                if current:
                    chunks.append(current)
                # Part itself may be too large — recurse with next separator
                if len(part.strip()) > chunk_size:
                    sub_chunks = _split_recursive(part.strip(), remaining_seps, chunk_size, overlap)
                    chunks.extend(sub_chunks)
                    current = ""
                else:
                    current = part.strip()

        if current:
            chunks.append(current)

        if not chunks:
            continue

        return _apply_overlap(chunks, overlap)

    return _hard_split(text, chunk_size, overlap)


def _hard_split(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Character-level split — only used when all separators fail."""
    chunks = []
    start  = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end].strip())
        start = end - overlap
    return [c for c in chunks if c]


def _apply_overlap(chunks: List[str], overlap: int) -> List[str]:
    """
    Append a trailing suffix from each chunk to the start of the next.
    Preserves context across chunk boundaries for better RAG retrieval.
    """
    if overlap <= 0 or len(chunks) <= 1:
        return chunks

    result = [chunks[0]]
    for i in range(1, len(chunks)):
        suffix = chunks[i - 1][-overlap:].strip()
        result.append((suffix + " " + chunks[i]).strip() if suffix else chunks[i])
    return result


def chunk_text(text: str, filename: str = "input.txt") -> List[str]:
    """
    Convenience: chunk raw text using the right strategy for the file type.

    Usage:
        chunks = chunk_text(raw_text, filename="policy.pdf")
    """
    cfg = get_chunk_config(filename)
    if cfg.strategy in (ChunkStrategy.RECURSIVE, ChunkStrategy.SEMANTIC, ChunkStrategy.PARAGRAPH):
        return recursive_split(text, cfg)
    # FIXED / CODE — simple hard split
    return _hard_split(text, cfg.chunk_size, cfg.overlap)


def agno_chunk_params(filename: str) -> dict:
    """
    Return kwargs for Agno ChromaKnowledgeBase chunking config.

    Usage:
        kb = ChromaKnowledgeBase(**agno_chunk_params("policy.pdf"))
    """
    cfg = get_chunk_config(filename)
    return {
        "chunk_size":    cfg.chunk_size,
        "chunk_overlap": cfg.overlap,
    }

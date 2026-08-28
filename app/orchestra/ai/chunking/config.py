from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict

import structlog

logger = structlog.get_logger()


class ChunkStrategy(str, Enum):
    RECURSIVE       = "recursive"
    BY_STRUCTURE    = "by_structure"
    PER_PAGE_ATOMIC = "per_page_atomic"
    SPREADSHEET     = "spreadsheet"
    LINE_ATOMIC     = "line_atomic"


@dataclass
class ChunkConfig:
    strategy:            ChunkStrategy = ChunkStrategy.RECURSIVE
    chunk_size:          int  = 1000
    overlap:             int  = 150
    min_chunk_size:      int  = 80
    keep_section_header: bool = True
    # When True, bakes "filename > section:" into the embedded chunk text. Off by
    # default: the constant filename prefix biases every vector of a document
    # toward each other and creates query/chunk asymmetry (queries carry no
    # prefix). filename + section already live in chunk metadata, so context is
    # reconstructed at prompt-assembly time instead (see context_enriched.py).
    context_enriched:    bool = True

    # Emit per-row chunks for tables in addition to the whole-table chunk, so a
    # lookup row is retrievable without dragging its twenty neighbours along.
    # See table_rows.py for why granularity is driven by column count.
    table_row_chunks:    bool = True
    table_row_max:       int  = 200   # above this, decline to expand at all
    table_row_wide_cols: int  = 4     # more columns than this -> group rows
    table_row_group:     int  = 10    # rows per group when grouping


# ── Shared presets ────────────────────────────────────────────────────────────

_STRUCT_WIDE  = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE,    chunk_size=1200, overlap=120, min_chunk_size=80)
_STRUCT_MED   = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE,    chunk_size=1000, overlap=100, min_chunk_size=60)
_STRUCT_SMALL = ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE,    chunk_size=900,  overlap=100, min_chunk_size=60)
_REC_TXT      = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,       chunk_size=900,  overlap=120, min_chunk_size=60)
_REC_JSON     = ChunkConfig(strategy=ChunkStrategy.RECURSIVE,       chunk_size=800,  overlap=80,  min_chunk_size=40)
_SHEET        = ChunkConfig(strategy=ChunkStrategy.SPREADSHEET,     chunk_size=800,  overlap=0,   min_chunk_size=0)
_SHEET_SMALL  = ChunkConfig(strategy=ChunkStrategy.SPREADSHEET,     chunk_size=600,  overlap=0,   min_chunk_size=0)
_ATOMIC       = ChunkConfig(strategy=ChunkStrategy.PER_PAGE_ATOMIC, chunk_size=2000, overlap=0,   min_chunk_size=0)
_LINE         = ChunkConfig(strategy=ChunkStrategy.LINE_ATOMIC,     chunk_size=0,    overlap=0,   min_chunk_size=0)

EXTENSION_CONFIG: Dict[str, ChunkConfig] = {
    # Structured documents
    ".pdf":  _STRUCT_WIDE,
    ".docx": _STRUCT_WIDE,   ".doc":  _STRUCT_WIDE,
    ".pptx": _STRUCT_MED,    ".ppt":  _STRUCT_MED,
    ".html": _STRUCT_MED,    ".htm":  _STRUCT_MED,
    ".md":   _STRUCT_SMALL,  ".rst":  _STRUCT_SMALL,
    # Spreadsheets — header repeated in every chunk
    ".xlsx": _SHEET,   ".xls":  _SHEET,
    ".csv":  _SHEET_SMALL,
    # Images / vision output — one page = one chunk
    ".png":  _ATOMIC,  ".jpg":  _ATOMIC,  ".jpeg": _ATOMIC,  ".webp": _ATOMIC,
    # Line-delimited JSON
    ".jsonl": _LINE,
    # Flat text
    ".txt":  _REC_TXT,
    ".json": _REC_JSON,
}

_DEFAULT_CONFIG = _REC_TXT


def get_config(filename: str) -> ChunkConfig:
    ext = Path(filename).suffix.lower()
    cfg = EXTENSION_CONFIG.get(ext, _DEFAULT_CONFIG)
    logger.debug("chunk_config", filename=filename, ext=ext, strategy=cfg.strategy.value)
    return cfg

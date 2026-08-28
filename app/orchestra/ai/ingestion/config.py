"""
IngestionConfig — single source of truth for all ingestion behaviour.

PARSER_MAP  — explicit dict of extension → parser chain (list of class names).
              First entry is primary, remaining entries are tried in order on failure.
              The registry reads this; individual parser files do NOT self-register.

Examples:
    ".pdf": ["PdfParser", "PyPdfParser"]
        → tries PdfParser first; if it raises ImportError or is disabled,
          falls back to PyPdfParser automatically.

    ".pdf": ["PdfParser"]
        → no fallback; failure raises immediately.

Every knob has a sensible default so the system works out-of-the-box.
Override any value via environment variables (prefix: INGESTION_).

Examples (.env):
    INGESTION_VISION_ENABLED=false
    INGESTION_VISION_MODEL=gpt-4o
    INGESTION_PDF_TABLE_AWARE=true
    INGESTION_LIBREOFFICE_PATH=/usr/bin/soffice
    INGESTION_ENABLED_EXTENSIONS=.pdf,.docx,.xlsx,.pptx,.txt,.md,.html,.csv,.json,.png,.jpg
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, TypedDict


class ParserEntry(TypedDict, total=False):
    parser:   str            # primary parser class name (required)
    fallback: Optional[str]  # fallback class name if primary fails
    module:   str            # dotted module path — only this module is imported


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()

def _bool(key: str, default: bool = True) -> bool:
    v = _env(key)
    if not v:
        return default
    return v.lower() in ("1", "true", "yes", "on")

def _int(key: str, default: int = 0) -> int:
    v = _env(key)
    try:
        return int(v) if v else default
    except ValueError:
        return default

def _list(key: str, default: List[str] = None) -> List[str]:
    v = _env(key)
    if not v:
        return default or []
    return [x.strip() for x in v.split(",") if x.strip()]


# ── Parser routing table ──────────────────────────────────────────────────────
# Value is a list of parser class names tried in order (primary → fallbacks).
# To swap primary: change index 0.
# To add a fallback: append to the list.
# To add a new format: one new key + new parser file.
#
# Class names are resolved lazily by the registry (avoids circular imports).

_PKG = "app.orchestra.ai.ingestion.parsers"

PARSER_MAP: Dict[str, ParserEntry] = {
    # ── PDF ───────────────────────────────────────────────────────────────────
    ".pdf":   {"parser": "PdfParser",    "fallback": "ImageParser", "module": f"{_PKG}.pdf_parser"},
    ".docx":  {"parser": "DocxParser",                              "module": f"{_PKG}.docx_parser"},
    ".doc":   {"parser": "DocxParser",   "fallback": "ImageParser", "module": f"{_PKG}.docx_parser"},
    ".xlsx":  {"parser": "XlsxParser",                              "module": f"{_PKG}.xlsx_parser"},
    ".xls":   {"parser": "XlsxParser",                              "module": f"{_PKG}.xlsx_parser"},
    ".pptx":  {"parser": "PptxParser",                              "module": f"{_PKG}.pptx_parser"},
    ".ppt":   {"parser": "PptxParser",   "fallback": "ImageParser", "module": f"{_PKG}.pptx_parser"},
    ".png":   {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".jpg":   {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".jpeg":  {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".webp":  {"parser": "ImageParser",                             "module": f"{_PKG}.image_parser"},
    ".txt":   {"parser": "TextParser",                              "module": f"{_PKG}.text_parser"},
    ".md":    {"parser": "TextParser",                              "module": f"{_PKG}.text_parser"},
    ".rst":   {"parser": "TextParser",                              "module": f"{_PKG}.text_parser"},
    ".html":  {"parser": "HtmlParser",                              "module": f"{_PKG}.html_parser"},
    ".htm":   {"parser": "HtmlParser",                              "module": f"{_PKG}.html_parser"},
    ".json":  {"parser": "JsonCsvParser",                           "module": f"{_PKG}.json_csv_parser"},
    ".jsonl": {"parser": "JsonCsvParser",                           "module": f"{_PKG}.json_csv_parser"},
    ".csv":   {"parser": "JsonCsvParser",                           "module": f"{_PKG}.json_csv_parser"},
}
# Fallbacks that live in a different module than the primary parser
_FALLBACK_MODULES: Dict[str, str] = {
    "ImageParser":  f"{_PKG}.image_parser",
    "PyPdfParser":  f"{_PKG}.pypdf_parser",
}


@dataclass
class IngestionConfig:
    # ── Parser routing ────────────────────────────────────────────────────────
    # Each value is a list: [primary, fallback1, fallback2, ...].
    # Registry walks the chain and uses the first parser that loads successfully.
    parser_map: Dict[str, ParserEntry] = field(
        default_factory=lambda: {k: dict(v) for k, v in PARSER_MAP.items()}
    )

    # ── Enabled extensions ────────────────────────────────────────────────────
    # Subset of parser_map keys that are active.
    enabled_extensions: List[str] = field(default_factory=lambda: list(PARSER_MAP.keys()))

    # ── Vision ────────────────────────────────────────────────────────────────
    vision_enabled:    bool = True
    vision_model:      str  = "gpt-4o-mini"
    vision_max_tokens: int  = 2000
    vision_dpi:        int  = 200
    vision_prompt:     str  = (
        "Extract all text content from this document page. "
        "For tables, preserve the structure using | separators with a header row. "
        "Prefix each table with its title or section name if visible. "
        "Return plain text only."
    )
    # "skip"  — log warning and continue when a vision call fails
    # "raise" — propagate exception and fail the upload
    vision_on_error: str = "skip"

    # ── PDF ───────────────────────────────────────────────────────────────────
    pdf_table_aware:              bool = True
    pdf_heading_detection:        bool = True
    pdf_min_text_chars:           int  = 20       # below this → treat page as scanned
    pdf_embedded_image_min_area:  int  = 10_000   # px² — skip logos/icons below this
    # Above this many image blocks on ONE page, the page is a decomposed graphic
    # rather than a page carrying figures, and its images are skipped.
    #
    # A cover page is often stored as one artwork sliced into many tiles. Measured
    # on the 57-page SBI MITC: 190 of its image blocks sat on exactly two pages —
    # the cover (34 chars of text, 95 images) and the back cover (336 chars, 95
    # images) — and 138 of them survived every existing filter, because an
    # individual tile is high-variance and byte-unique so it looks like content to
    # both the decorative check and the dedup cache. Captioning 95 fragments of
    # one graphic yields noise, not content, and cost 138 vision calls: >6 minutes
    # against 12.7s with vision off.
    #
    # A genuine figure-heavy page carries a handful of images, not dozens.
    pdf_max_images_per_page:      int  = 12
    # Pages a section label may run without a new heading before it's treated as
    # a heading-detection miss and cleared. Legal/policy documents routinely
    # carry one "TERMS & CONDITIONS" heading over dozens of pages, so this has
    # to be generous or correct labels get thrown away (see pdf_parser).
    pdf_stale_section_pages:      int  = 40

    # ── LibreOffice (legacy .doc / .ppt / .xls) ──────────────────────────────
    libreoffice_enabled: bool = True
    libreoffice_path:    str  = "soffice"

    # ── Chunking overrides (0 = use chunking.py defaults) ─────────────────────
    chunk_size_pdf:    int = 0
    chunk_size_office: int = 0
    chunk_size_sheet:  int = 0
    chunk_overlap:     int = 0


def build_ingestion_config() -> IngestionConfig:
    """Build IngestionConfig from environment variables."""
    cfg = IngestionConfig(
        vision_enabled     = _bool("INGESTION_VISION_ENABLED",      True),
        vision_model       = _env ("INGESTION_VISION_MODEL",         "gpt-4o-mini"),
        vision_max_tokens  = _int ("INGESTION_VISION_MAX_TOKENS",    2000),
        vision_dpi         = _int ("INGESTION_VISION_DPI",           200),
        vision_prompt      = _env ("INGESTION_VISION_PROMPT") or IngestionConfig.vision_prompt,
        vision_on_error    = _env ("INGESTION_VISION_ON_ERROR",      "skip"),

        pdf_table_aware             = _bool("INGESTION_PDF_TABLE_AWARE",             True),
        pdf_heading_detection       = _bool("INGESTION_PDF_HEADING_DETECTION",       True),
        pdf_min_text_chars          = _int ("INGESTION_PDF_MIN_TEXT_CHARS",          20),
        pdf_embedded_image_min_area = _int ("INGESTION_PDF_EMBEDDED_IMAGE_MIN_AREA", 10_000),
        pdf_max_images_per_page     = _int ("INGESTION_PDF_MAX_IMAGES_PER_PAGE", 12),
        pdf_stale_section_pages     = _int ("INGESTION_PDF_STALE_SECTION_PAGES",      40),

        libreoffice_enabled = _bool("INGESTION_LIBREOFFICE_ENABLED", True),
        libreoffice_path    = _env ("INGESTION_LIBREOFFICE_PATH",     "soffice"),

        chunk_size_pdf    = _int("INGESTION_CHUNK_SIZE_PDF",    0),
        chunk_size_office = _int("INGESTION_CHUNK_SIZE_OFFICE", 0),
        chunk_size_sheet  = _int("INGESTION_CHUNK_SIZE_SHEET",  0),
        chunk_overlap     = _int("INGESTION_CHUNK_OVERLAP",     0),
    )

    exts = _list("INGESTION_ENABLED_EXTENSIONS")
    if exts:
        cfg.enabled_extensions = [e for e in exts if e in cfg.parser_map]

    return cfg

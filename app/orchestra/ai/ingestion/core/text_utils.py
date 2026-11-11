"""Shared byte decoding and display-text cleanup for ingestion."""
from __future__ import annotations

import re

# ── PDF font-encoding artefacts ──────────────────────────────────────────────
#
# Many PDF authoring tools (InDesign, Illustrator, and even MS Word's "Save
# as PDF") embed glyphs from custom CMap tables that map standard punctuation
# to visually similar but semantically wrong Unicode code points.  PyMuPDF
# faithfully extracts what the CMap tells it, so we see e.g. U+02C7 (caron)
# where the PDF meant U+2019 (right single quotation mark / apostrophe).
#
# The mapping below is derived from real-world documents ingested through
# the platform and verified against the rendered glyphs in the originals.
_FONT_GLYPH_MAP: dict[str, str] = {
    "\u02c7": "\u2019",   # caron  → right single quotation mark (apostrophe)
    "\u02dd": "\u201c",   # double acute accent → left double quotation mark
    "\u02db": "\u201d",   # ogonek → right double quotation mark
    "\u02c6": "\u2013",   # modifier circumflex → en-dash (common in financial PDFs)
    "\u02dc": "\u2014",   # small tilde → em-dash
}

# A pre-compiled translation table is ~50× faster than chained .replace()
# for documents with thousands of occurrences.
_GLYPH_TRANS = str.maketrans(_FONT_GLYPH_MAP)

# Control characters that are never meaningful in displayed text.
# Preserves TAB (\x09), LF (\x0A), and CR (\x0D) which carry layout intent.
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")


def sanitize_extracted_text(text: str | None) -> str:
    """Clean common encoding artefacts from parser-produced text.

    Returns an empty string for ``None`` / blank input.  Safe to call on
    already-clean text (idempotent).
    """
    if not text:
        return ""

    # 1. Fix font-encoding glyph mis-mappings (caron→apostrophe etc.)
    text = text.translate(_GLYPH_TRANS)

    # 2. Replace Unicode LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR
    #    (U+2029) with plain newlines — they render as invisible whitespace
    #    in most UIs and break monospaced pre-formatted display.
    text = text.replace("\u2028", "\n").replace("\u2029", "\n\n")

    # 3. Normalise non-breaking spaces to regular spaces so the text
    #    reflows naturally in the UI preview.
    text = text.replace("\xa0", " ")

    # 4. Strip binary control characters (NULL, BEL, BS, etc.) that leak
    #    through from damaged or non-text PDF streams.
    text = _CONTROL_CHAR_RE.sub("", text)

    # 5. Collapse runs of 3+ newlines into exactly 2 (one blank line).
    #    PyMuPDF page joins can produce long blank stretches that waste
    #    screen space in the preview modal.
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def decode_text(raw: bytes) -> str:
    """Decode UTF-8 (including BOM), then Windows text, then lossless Latin-1."""
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def clean_prose_lines(text: str) -> str:
    """Remove standalone escape artefacts and exact adjacent prose duplicates.

    Call before evidence spans are assigned, never on code or table rows.
    Backslashes inside paths, URLs, expressions and normal sentences survive.
    """
    lines = []
    previous = None
    for line in text.splitlines():
        value = line.strip()
        if re.fullmatch(r"\\+", value):
            value = ''
        if value and value == previous:
            continue
        lines.append(value)
        previous = value
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()

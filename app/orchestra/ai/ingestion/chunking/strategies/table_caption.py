"""
Table captioning — makes table chunks retrievable for CONCEPTUAL queries.

A pipe-delimited table embeds as mostly numbers and terse labels, so a natural
query like "eligibility / entry age / sum assured / technical details" doesn't
match its vector — even though the answer is right there. Prepending a one-line
caption built from the section heading + the table's COLUMN HEADERS puts those
concept words into the embedded text, so the table becomes findable.

Pure heuristic: no LLM, no network. (An LLM-generated caption — Anthropic-style
contextual retrieval — is a future upgrade; the column headers already carry the
concepts most queries key on.)
"""

from __future__ import annotations

import re
from typing import List, Optional

import structlog

logger = structlog.get_logger()

_PAGE_SUFFIX = re.compile(r"\s*\(page\s*\d+\)\s*:?\s*$", re.IGNORECASE)


def _cells(line: str) -> List[str]:
    return [c.strip() for c in line.split("|") if c.strip()]


def _is_label(s: str) -> bool:
    """A concept label (e.g. 'Entry Age') vs a value (e.g. '18 years', 'INR 10,000').
    Labels start with a letter and have a few alphabetic chars; values start with
    a digit/symbol. Keeps the caption's concept terms clean."""
    return bool(s) and s[0].isalpha() and sum(c.isalpha() for c in s) >= 3 and len(s) <= 40


def caption_table(text: str, section: str = "") -> str:
    """
    Build a one-line caption that surfaces the table's concept terms regardless
    of orientation — column headers AND first-column row labels — e.g.:
        "[TABLE] Eligibility — columns: Parameter, Minimum, Maximum.
         rows: Entry Age, Age at Maturity, Basic Sum Assured. 3 data rows."

    Returns "" if `text` has no recognisable table rows.
    """
    lines = [ln for ln in text.splitlines() if ln.strip()]

    header_cells: List[str] = []
    row_labels: List[str] = []
    row_lines = 0
    for ln in lines:
        if "|" not in ln:
            continue
        cells = _cells(ln)
        row_lines += 1
        if not header_cells and len(cells) >= 2:
            header_cells = cells          # first multi-cell row = column headers
            continue
        # First cell of a data row is often the parameter name in transposed
        # tables (concepts live down the first column, not across the top).
        if cells and _is_label(cells[0]):
            row_labels.append(cells[0])

    if row_lines == 0:
        return ""  # not actually a pipe table

    data_rows = max(0, row_lines - (1 if header_cells else 0))

    # Row labels only add value if they're not already the column headers.
    seen = {c.lower() for c in header_cells}
    row_labels = [r for r in row_labels if r.lower() not in seen][:8]

    # Clean the section label: drop a serialiser's trailing "(page N):".
    title = _PAGE_SUFFIX.sub("", (section or "").strip()).strip()

    parts = ["[TABLE]"]
    if title:
        parts.append(f"{title} —")
    if header_cells:
        parts.append(f"columns: {', '.join(header_cells[:10])}.")
    if row_labels:
        parts.append(f"rows: {', '.join(row_labels)}.")
    if data_rows:
        parts.append(f"{data_rows} data rows.")

    caption = " ".join(parts).strip()
    return caption if (title or header_cells or row_labels) else ""


def llm_caption(text: str, section: str = "") -> str:
    """
    One-sentence LLM caption naming the table's key parameters, for retrieval.
    Costs one cheap LLM call. Returns "" on any failure so the caller can fall
    back to the heuristic.
    """
    try:
        from app.config import settings
        if not settings.OPENAI_API_KEY:
            return ""
        from openai import OpenAI

        snippet = text[:1500]
        prompt = (
            "In ONE concise sentence, describe what this table contains so a "
            "search query can find it. Name the key parameters / column headers / "
            "row labels (e.g. entry age, maturity age, sum assured, premium). "
            "Do NOT include the numeric values. Reply with the sentence only.\n"
            f"Section: {section or 'n/a'}\nTable:\n{snippet}"
        )
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL or "gpt-4o-mini",
            max_tokens=80,
            messages=[{"role": "user", "content": prompt}],
        )
        cap = (resp.choices[0].message.content or "").strip()
        return f"[TABLE] {cap}" if cap else ""
    except Exception as e:
        logger.warning("table_caption.llm_failed", error=str(e))
        return ""


def caption_for_table(text: str, section: str = "", mode: Optional[str] = None) -> str:
    """
    Dispatch to the configured captioner. `mode` defaults to
    settings.TABLE_CAPTION_MODE (heuristic | llm | none). LLM mode falls back to
    the heuristic if the LLM call yields nothing, so captions never silently
    vanish.
    """
    if mode is None:
        try:
            from app.config import settings
            mode = (settings.TABLE_CAPTION_MODE or "heuristic").strip().lower()
        except Exception:
            mode = "heuristic"

    if mode == "none":
        return ""
    if mode == "llm":
        return llm_caption(text, section) or caption_table(text, section)
    return caption_table(text, section)

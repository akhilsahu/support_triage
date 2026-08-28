"""
Row-level chunks for tables, alongside the whole-table chunk.

A lookup table is a set of independent facts that happen to share a layout. The
SBI MITC fee schedule lists ~20 cards; as one chunk, "annual fee for SBI Card
PRIME" is matched against a block that also contains AURUM, ELITE, MILES ELITE,
MILES PRIME and Titan. Similarity cannot pick a row out of a blob, and when the
blob is retrieved the model is handed twenty rows with "SBI Card MILES PRIME —
2,999" sitting one line from "SBI Card PRIME". Splitting per row makes each fact
independently retrievable and stops neighbouring rows bleeding into each other.

This reads the markdown the PDF parser already emits rather than plumbing
structured cells through ParsedPage: `_table_to_text` / `_serialise_table`
generate that markdown themselves, so its shape is known rather than guessed,
and the parser stays untouched.

Granularity is width-driven, not dogmatic. General guidance favours grouping
10-30 rows per chunk, which is right for wide analytical tables where a question
spans rows ("which cards cost more than 5,000?"). It is wrong for a narrow lookup
table, where row adjacency is the thing causing the failure. So narrow tables go
one-row-per-chunk and wide ones stay grouped, with the header repeated either
way. The whole-table chunk is always kept as well, so comparisons and "show me
the fee table" still work.
"""

from __future__ import annotations

import re
from typing import List, NamedTuple

import structlog

logger = structlog.get_logger()

# A markdown separator row: |---|---|---|
_SEPARATOR_RE = re.compile(r"^\|[\s:|-]+\|$")


class TableRowChunk(NamedTuple):
    text:  str
    label: str   # first cell — what this row is *about*


def _cells(line: str) -> List[str]:
    """Split a markdown pipe row into cells, dropping the outer empties."""
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _row_text(header: List[str], row: List[str], section: str) -> TableRowChunk:
    """
    Render one row as a self-contained sentence.

        Fees and Charges > SBI Card PRIME — Annual Fee (Rs.): 2,999.
        Renewal Fee (Rs.): 2,999 (Waived off on annual spends of Rs.2 Lakh).

    The leading "{section} > {label}" is the embed-time context prefix. Only the
    *varying* part of a chunk's context belongs in the vector: the label differs
    per row, so it separates PRIME from MILES PRIME, which is the entire point.
    A constant per-document prefix would do the opposite and pull a document's
    vectors together — that is why filename/topic context is attached at
    prompt-assembly time instead (see context_enriched.enrich_for_prompt).
    """
    label = row[0] if row else ""
    parts = []
    for i, cell in enumerate(row[1:], start=1):
        if not cell:
            continue
        col = header[i] if i < len(header) else ""
        parts.append(f"{col}: {cell}" if col else cell)

    body = ". ".join(parts)
    lead = f"{section} > {label}" if section else label
    return TableRowChunk(text=f"{lead} — {body}." if body else lead, label=label)


def _group_text(header: List[str], rows: List[List[str]], section: str) -> TableRowChunk:
    """A grouped-row chunk for wide tables — header repeated, rows kept as markdown."""
    width = max(len(header), max((len(r) for r in rows), default=0))
    md = ["| " + " | ".join(header) + " |", "|" + "|".join(["---"] * width) + "|"]
    md += ["| " + " | ".join(r) + " |" for r in rows]
    lead = f"{section}:" if section else "Table:"
    return TableRowChunk(text=lead + "\n" + "\n".join(md), label=rows[0][0] if rows and rows[0] else "")


def split_table_rows(
    table_text: str,
    section:    str,
    *,
    max_rows:   int = 200,
    wide_cols:  int = 4,
    group_size: int = 10,
    min_len:    int = 0,
) -> List[TableRowChunk]:
    """
    Split rendered table markdown into row-level chunks.

    Tolerant of what actually reaches it: a caption line prepended by
    `caption_for_table`, a lead-in prose line absorbed by `chunk_by_structure`,
    and several tables fused into one text by `_merge_continuation_tables`. Any
    line that is not a pipe row is simply skipped, and each separator row marks
    the line above it as the header for the block that follows.

    Returns [] when there is nothing worth splitting (no table, or a single data
    row — which is already atomic, so a row chunk would just duplicate the
    whole-table chunk).
    """
    header: List[str] = []
    pending: List[str] = []      # last pipe row seen, the header candidate
    rows: List[List[str]] = []

    for line in table_text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            pending = []
            continue
        if _SEPARATOR_RE.match(stripped):
            # The row immediately above a separator is that block's header.
            if pending:
                header = pending
                pending = []
            continue
        cells = _cells(stripped)
        if header:
            rows.append(cells)
        else:
            pending = cells

    if not header or len(rows) < 2:
        return []

    if len(rows) > max_rows:
        # A 5,000-row export must not become 5,000 chunks. The whole-table chunk
        # still covers it; only the row-level expansion is declined.
        logger.info("chunking.table_rows.skipped_too_many", rows=len(rows), cap=max_rows)
        return []

    out: List[TableRowChunk] = []
    if len(header) > wide_cols:
        for i in range(0, len(rows), group_size):
            out.append(_group_text(header, rows[i:i + group_size], section))
    else:
        for row in rows:
            if not row or not row[0]:
                continue
            out.append(_row_text(header, row, section))

    return [c for c in out if len(c.text) >= min_len]

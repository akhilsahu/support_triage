"""Parse independent Markdown tables and emit source-grounded lookup groups."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import NamedTuple

_SEPARATOR_CELL_RE = re.compile(r":?-{3,}:?$")
_FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


@dataclass
class MarkdownTable:
    start: int
    end: int
    header_end: int
    rows: list[tuple[int, int, str]]
    columns: list[str]


class TableRowChunk(NamedTuple):
    text: str
    label: str
    source_spans: tuple[tuple[int, int], ...] = ()


def _cells(line: str) -> list[str]:
    # An escaped pipe is cell content, not a column boundary.
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", line.strip().strip("|"))]


def fenced_code_spans(text: str) -> list[tuple[int, int]]:
    """Locate complete/unclosed Markdown fences without rewriting source text."""
    result = []
    opening = None
    offset = 0
    for line in text.splitlines(keepends=True):
        match = _FENCE_RE.match(line.rstrip("\r\n"))
        if match:
            marker, tail = match.groups()
            if opening is None:
                opening = (offset, marker[0], len(marker))
            elif marker[0] == opening[1] and len(marker) >= opening[2] and not tail.strip():
                result.append((opening[0], offset + len(line)))
                opening = None
        offset += len(line)
    if opening is not None:
        result.append((opening[0], len(text)))
    return result


def table_blocks(text: str) -> list[MarkdownTable]:
    lines = text.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    protected = fenced_code_spans(text)

    def header_at(index):
        header, separator = lines[index], lines[index + 1]
        if header.startswith(("    ", "\t")) or separator.startswith(("    ", "\t")):
            return False
        if not header.strip().startswith("|") or not separator.strip().startswith("|"):
            return False
        columns, markers = _cells(header), _cells(separator)
        return (len(columns) == len(markers) and len(columns) >= 1
                and all(_SEPARATOR_CELL_RE.fullmatch(cell) for cell in markers))

    tables = []
    index = 0
    while index + 1 < len(lines):
        if any(start <= offsets[index] < end for start, end in protected) or not header_at(index):
            index += 1
            continue
        start = index
        index += 2
        rows = []
        while index < len(lines) and lines[index].strip().startswith("|"):
            # Adjacent tables retain their own headers and identity.
            if index + 1 < len(lines) and header_at(index):
                break
            if lines[index].startswith(("    ", "\t")):
                break
            rows.append((offsets[index], offsets[index + 1], lines[index]))
            index += 1
        if rows:
            tables.append(MarkdownTable(offsets[start], offsets[index], offsets[start + 2],
                                        rows, _cells(lines[start])))
    return tables


def split_table_rows(table_text: str, section: str, *, max_rows: int = 200,
                     wide_cols: int = 4, group_size: int = 10, min_len: int = 0):
    """Repeat each table's own headers; group large tables instead of dropping rows."""
    if min(max_rows, wide_cols, group_size) < 1:
        raise ValueError("Table limits must be positive")
    output = []
    for table in table_blocks(table_text):
        if len(table.rows) < 2:
            continue
        width = group_size if len(table.columns) > wide_cols or len(table.rows) > max_rows else 1
        for start in range(0, len(table.rows), width):
            rows = table.rows[start:start + width]
            intervals = [(table.start, table.header_end)] + [(a, b) for a, b, _ in rows]
            body = "".join(table_text[a:b] for a, b in intervals)
            label = _cells(rows[0][2])[0] if rows else ""
            # min_len is a preferred target, never permission to discard evidence.
            output.append(TableRowChunk(body, label, tuple(intervals)))
    return output

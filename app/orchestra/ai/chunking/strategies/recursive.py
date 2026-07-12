from __future__ import annotations

import re
from typing import List

from app.rag.document_parser import Chunk, ParsedDocument
from app.orchestra.ai.chunking.config import ChunkConfig

_SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""]


def chunk_recursive(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    combined_parts: List[str] = []
    page_map: List[tuple] = []
    pos = 0
    for p in doc.pages:
        text = re.sub(r"[ \t]+", " ", p.text).strip()
        if not text:
            continue
        page_map.append((pos, p.page))
        combined_parts.append(text)
        pos += len(text) + 2

    if not combined_parts:
        return []

    full_text = "\n\n".join(combined_parts)

    def _page_for(char_offset: int) -> int:
        page = page_map[0][1]
        for start, pg in page_map:
            if char_offset >= start:
                page = pg
            else:
                break
        return page

    chunks: List[Chunk] = []
    offset = 0
    for idx, piece in enumerate(split_recursive(full_text, cfg.chunk_size, cfg.overlap)):
        if len(piece) < cfg.min_chunk_size:
            continue
        chunks.append(Chunk(text=piece, page=_page_for(offset), chunk_index=idx, section=""))
        offset += len(piece)

    return chunks


def split_recursive(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Exported so BY_STRUCTURE can reuse for oversized groups."""
    def _split(t: str, separators: List[str]) -> List[str]:
        if not t.strip():
            return []
        sep, rest = separators[0], separators[1:]
        good: List[str] = []
        current = ""
        for piece in (t.split(sep) if sep else list(t)):
            candidate = (current + sep + piece).lstrip(sep) if current else piece
            if len(candidate) <= chunk_size:
                current = candidate
            else:
                if current:
                    good.append(current)
                if len(piece) > chunk_size and rest:
                    good.extend(_split(piece, rest))
                    current = ""  # already flushed above and fully handled by
                                  # the recursive call — without this reset, the
                                  # stale `current` survives into the next loop
                                  # iteration and gets appended to `good` a
                                  # second time on the following flush,
                                  # duplicating already-emitted text verbatim.
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

    result: List[str] = []
    for i, c in enumerate(raw):
        if i == 0:
            result.append(c)
        else:
            tail_raw = result[i - 1][-overlap:]
            # Raw char-slice can land mid-word (e.g. "policy" -> "icy"). Drop
            # any partial leading word fragment so we only ever re-attach
            # whole words.
            tail = tail_raw.split(" ", 1)[1] if " " in tail_raw else ""
            result.append(c if c.startswith(tail.lstrip()) else (tail.rstrip() + " " + c.lstrip()).strip())
    return [c.strip() for c in result if c.strip()]

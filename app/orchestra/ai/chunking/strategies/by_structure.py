from __future__ import annotations

import re
from typing import List

from app.rag.document_parser import Chunk, ParsedDocument
from app.orchestra.ai.chunking.config import ChunkConfig
from app.orchestra.ai.chunking.strategies.recursive import split_recursive


def chunk_by_structure(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """
    Group ParsedPages by section label, then split oversized groups.
    Table pages (is_table=True) are always emitted as a single chunk — never split.
    """
    groups: List[dict] = []

    for p in doc.pages:
        section  = (p.section or "").strip()
        text     = re.sub(r"[ \t]+", " ", p.text).strip()
        is_table = getattr(p, "is_table", False)

        if not text:
            continue

        # Table pages are always their own independent group
        if is_table:
            last = groups[-1] if groups else None
            table_texts = [text]
            table_pages = [p.page]
            page_start = p.page
            # A tiny group right before a table would otherwise become an
            # isolated near-empty chunk (the normal absorb-forward check below
            # never runs for it, since we `continue` before reaching it). Fold
            # it in as a lead-in line instead — a short sentence right before
            # a table is very often the table's own caption.
            if last and not last["is_table"] and len("\n\n".join(last["texts"])) < cfg.min_chunk_size:
                absorbed = groups.pop()
                table_texts = [*absorbed["texts"], text]
                table_pages = [*absorbed["pages"], p.page]
                page_start  = absorbed["page_start"]

            groups.append({
                "section":    section,
                "page_start": page_start,
                "page_end":   p.page,
                "texts":      table_texts,
                "pages":      table_pages,   # real page per entry in "texts", same order
                "is_table":   True,
            })
            continue

        last = groups[-1] if groups else None

        if last and not last["is_table"] and last["section"] == section:
            last["texts"].append(text)
            last["pages"].append(p.page)
            last["page_end"] = p.page
        elif last and not last["is_table"] and len("\n\n".join(last["texts"])) < cfg.min_chunk_size:
            # Absorb tiny trailing section into the new one
            last["texts"].append(text)
            last["pages"].append(p.page)
            last["page_end"] = p.page
            last["section"]  = last["section"] or section
        else:
            groups.append({
                "section":    section,
                "page_start": p.page,
                "page_end":   p.page,
                "texts":      [text],
                "pages":      [p.page],   # real page per entry in "texts", same order
                "is_table":   False,
            })

    # A tiny trailing group at the very end of the document never gets a
    # chance to be absorbed (nothing comes after it to trigger the check
    # above). Fold it into its predecessor instead of leaving it as an
    # isolated near-empty chunk — but only into another prose group. Folding
    # it into a table would mix an unrelated section into an otherwise-clean
    # table chunk, which is worse than leaving a small trailing chunk as-is.
    if (
        len(groups) >= 2
        and not groups[-1]["is_table"]
        and not groups[-2]["is_table"]
        and len("\n\n".join(groups[-1]["texts"])) < cfg.min_chunk_size
    ):
        tail = groups.pop()
        groups[-1]["texts"].extend(tail["texts"])
        groups[-1]["pages"].extend(tail["pages"])
        groups[-1]["page_end"] = tail["page_end"]

    chunks: List[Chunk] = []
    idx = 0

    for g in groups:
        full_text = "\n\n".join(g["texts"]).strip()
        if not full_text:
            continue

        header = g["section"]

        def _make_text(body: str) -> str:
            if cfg.keep_section_header and header:
                return f"{header}\n\n{body}".strip()
            return body

        # Table pages: single chunk regardless of size. Prepend a caption
        # (section + column/row labels, or an LLM sentence) so conceptual queries
        # match the table's vector — the caption carries the title, so skip the
        # section header. Mode via settings.TABLE_CAPTION_MODE.
        if g["is_table"]:
            from app.orchestra.ai.chunking.strategies.table_caption import caption_for_table
            cap = caption_for_table(full_text, header)
            table_text = f"{cap}\n{full_text}" if cap else _make_text(full_text)
            chunks.append(Chunk(
                text=table_text,
                page=g["page_start"],
                chunk_index=idx,
                section=header,
                is_table=True,
            ))
            idx += 1

            # ...and additionally one chunk per row, so a single lookup row can
            # be retrieved without its twenty neighbours. The whole-table chunk
            # above is kept for comparisons and "show me the fee table".
            if cfg.table_row_chunks:
                from app.orchestra.ai.chunking.strategies.table_rows import split_table_rows
                for row in split_table_rows(
                    full_text, header,
                    max_rows=cfg.table_row_max,
                    wide_cols=cfg.table_row_wide_cols,
                    group_size=cfg.table_row_group,
                ):
                    chunks.append(Chunk(
                        text=row.text,
                        page=g["page_start"],
                        chunk_index=idx,
                        section=header,
                        is_table=True,
                        is_table_row=True,
                        row_label=row.label,
                    ))
                    idx += 1
            continue

        if len(full_text) <= cfg.chunk_size:
            chunks.append(Chunk(
                text=_make_text(full_text),
                page=g["page_start"],
                chunk_index=idx,
                section=header,
            ))
            idx += 1
        else:
            # A group that absorbed several real pages (same section running on,
            # or tiny-section absorption) can still exceed chunk_size and get cut
            # into multiple pieces here. Every piece used to be stamped with
            # g["page_start"] regardless of which real page its text actually
            # came from — a piece drawn from three pages into the group reported
            # the group's FIRST page, not its own. Build an offset->page map
            # from the same per-entry pages list "pages" tracks (mirrors
            # recursive.py's _page_for) so each piece gets the real page its
            # own text starts on.
            page_map: List[tuple] = []
            pos = 0
            for text_block, page_num in zip(g["texts"], g["pages"]):
                page_map.append((pos, page_num))
                pos += len(text_block) + 2   # +2 for the "\n\n" join separator

            def _page_for(char_offset: int) -> int:
                page = page_map[0][1]
                for start, pg in page_map:
                    if char_offset >= start:
                        page = pg
                    else:
                        break
                return page

            search_from = 0
            for piece in split_recursive(full_text, cfg.chunk_size, cfg.overlap):
                if len(piece) < cfg.min_chunk_size:
                    continue
                # split_recursive prepends borrowed trailing words from the
                # PREVIOUS piece onto this one (for reading context), so this
                # piece's own text does not start where its raw length would
                # suggest — tracking a running "offset += len(piece)" drifts by
                # roughly the overlap size on every piece, which showed up as a
                # persistent off-by-one-page error once real per-page boundaries
                # existed to get wrong. Instead, locate a snippet from PAST the
                # borrowed region (skip cfg.overlap chars in) directly in
                # full_text — that substring is never borrowed, so .find() gives
                # this piece's true position.
                probe_start = min(cfg.overlap, max(0, len(piece) - 20))
                probe = piece[probe_start:probe_start + 40].strip()
                found = full_text.find(probe, search_from) if probe else -1
                if found == -1:
                    found = full_text.find(probe) if probe else -1
                piece_offset = (found - probe_start) if found != -1 else search_from
                chunks.append(Chunk(
                    text=_make_text(piece),
                    page=_page_for(max(0, piece_offset)),
                    chunk_index=idx,
                    section=header,
                ))
                idx += 1
                search_from = max(search_from, piece_offset) + 1

    return chunks

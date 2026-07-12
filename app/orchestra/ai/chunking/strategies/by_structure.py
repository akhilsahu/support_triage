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
            page_start = p.page
            # A tiny group right before a table would otherwise become an
            # isolated near-empty chunk (the normal absorb-forward check below
            # never runs for it, since we `continue` before reaching it). Fold
            # it in as a lead-in line instead — a short sentence right before
            # a table is very often the table's own caption.
            if last and not last["is_table"] and len("\n\n".join(last["texts"])) < cfg.min_chunk_size:
                absorbed = groups.pop()
                table_texts = [*absorbed["texts"], text]
                page_start  = absorbed["page_start"]

            groups.append({
                "section":    section,
                "page_start": page_start,
                "page_end":   p.page,
                "texts":      table_texts,
                "is_table":   True,
            })
            continue

        last = groups[-1] if groups else None

        if last and not last["is_table"] and last["section"] == section:
            last["texts"].append(text)
            last["page_end"] = p.page
        elif last and not last["is_table"] and len("\n\n".join(last["texts"])) < cfg.min_chunk_size:
            # Absorb tiny trailing section into the new one
            last["texts"].append(text)
            last["page_end"] = p.page
            last["section"]  = last["section"] or section
        else:
            groups.append({
                "section":    section,
                "page_start": p.page,
                "page_end":   p.page,
                "texts":      [text],
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
            for piece in split_recursive(full_text, cfg.chunk_size, cfg.overlap):
                if len(piece) < cfg.min_chunk_size:
                    continue
                chunks.append(Chunk(
                    text=_make_text(piece),
                    page=g["page_start"],
                    chunk_index=idx,
                    section=header,
                ))
                idx += 1

    return chunks

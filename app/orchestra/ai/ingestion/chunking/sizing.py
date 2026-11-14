"""Lossless splitting, source offsets and final embedding-token budgets."""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import replace
from functools import lru_cache
import re

from app.orchestra.ai.core.document_models import Chunk
from app.orchestra.ai.config import ChunkConfig

CHUNKING_VERSION = "bounded-v4"


@lru_cache(maxsize=8)
def _encoding(name: str):
    import tiktoken
    return tiktoken.get_encoding(name)


def token_count(text: str, cfg: ChunkConfig) -> int:
    # Source documents may literally contain tokenizer special-token strings.
    return len(_encoding(cfg.tokenizer_name).encode(text, disallowed_special=()))


def fits(text: str, cfg: ChunkConfig) -> bool:
    return (not cfg.chunk_size or len(text) <= cfg.chunk_size) and token_count(text, cfg) <= cfg.max_tokens


def _context_prefix(text: str, cfg: ChunkConfig) -> str:
    """Bound generated context only; source evidence is never truncated."""
    while text and (token_count(text + "\n", cfg) > cfg.max_tokens // 4 or
                    (cfg.chunk_size and len(text) + 1 > cfg.chunk_size // 4)):
        text = text[:max(0, len(text) * 3 // 4)]
    return text.rstrip() + "\n" if text.strip() else ""


def _unit_boundaries(text: str, split_mode: str, explicit=None) -> list[int]:
    """Structural boundaries only; punctuation cannot prove semantic completeness."""
    if explicit is not None:
        if (split_mode != "rows" or not isinstance(explicit, (list, tuple))
                or any(type(offset) is not int or not 0 <= offset <= len(text) for offset in explicit)):
            raise ValueError("Invalid explicit row boundaries")
        return sorted({0, len(text), *explicit})
    pattern = r"\r?\n(?:[ \t]*\r?\n)+" if split_mode == "prose" else r"\n"
    boundaries = [] if split_mode == "record" else [match.end() for match in re.finditer(pattern, text)]
    return sorted({0, len(text), *boundaries})


def spans(text: str, cfg: ChunkConfig, prefix: str = "", repeat: str = "", *, split_mode: str = "prose", unit_boundaries=None):
    """Yield exact source slices; overlap is part of the final budget."""
    if split_mode not in ("prose", "rows", "lines", "record"):
        raise ValueError("Unknown chunk split mode")
    units = _unit_boundaries(text, split_mode, unit_boundaries)
    sentences = [match.end() for match in re.finditer(r"[.!?;][ \t\r\n]+", text)] if split_mode == "prose" else []
    words = [match.end() for match in re.finditer(r"\s+", text)]
    boundaries = [units, sentences, words] if split_mode == "prose" else [units, words]
    overlap_boundaries = sorted(set(units + sentences)) if split_mode == "prose" else units
    start = 0
    first = True
    while start < len(text):
        repeated = repeat if not first else ""
        lead = prefix + repeated
        end = min(len(text), start + (cfg.chunk_size or cfg.max_tokens * 8))
        if cfg.chunk_size:
            end = min(end, start + cfg.chunk_size - len(lead))
        if end <= start:
            raise ValueError("Chunk prefix leaves no room for source content")
        if not fits(lead + text[start:end], cfg):
            low, high = start, end
            while low < high:
                middle = (low + high + 1) // 2
                if fits(lead + text[start:middle], cfg):
                    low = middle
                else:
                    high = middle - 1
            end = low
        # Recheck actual text rather than assuming token counts are monotonic.
        while end > start and not fits(lead + text[start:end], cfg):
            end -= 1
        if end == start:
            raise ValueError("Chunk budget cannot fit a source character")
        if end < len(text):
            # Prefer complete units with a useful size; lower-priority boundaries
            # keep a tiny leading paragraph/header from forcing tiny chunks.
            floor = start + min(cfg.min_chunk_size, (end - start) // 2) if split_mode == "prose" else start
            for candidates in boundaries:
                position = bisect_right(candidates, end) - 1
                if position >= 0:
                    boundary = candidates[position]
                    if split_mode == "rows" and first and repeat and boundary <= len(repeat) < end:
                        continue
                    if boundary > floor and text[start:boundary].strip() and fits(lead + text[start:boundary], cfg):
                        end = boundary
                        break
        yield start, end, lead, repeated
        if end == len(text):
            break
        next_start = end
        if cfg.overlap:
            earliest = max(start + 1, end - min(cfg.overlap, (end - start) // 2))
            position = bisect_left(overlap_boundaries, earliest)
            if position < len(overlap_boundaries) and overlap_boundaries[position] < end:
                next_start = overlap_boundaries[position]
            elif split_mode in ("prose", "record"):
                # An oversized sentence/record may have no whole-unit overlap.
                position = bisect_left(words, earliest)
                if position < len(words) and words[position] < end:
                    next_start = words[position]
            # Rows and code lines never restart midway through a unit.
        start = next_start
        first = False


def joined_pages(pages):
    parts, segments, position = [], [], 0
    for fragment, page in pages:
        if not page.text.strip():
            continue
        parts.append(page.text)
        segments.append({"start": position, "end": position + len(page.text),
                         "page": page.page, "page_fragment": fragment, "source_start": 0})
        position += len(page.text) + 2
    return "\n\n".join(parts), segments


def slice_segments(segments, start: int, end: int):
    result = []
    for segment in segments:
        left, right = max(start, segment["start"]), min(end, segment["end"])
        if left < right:
            result.append({"page": segment["page"], "page_fragment": segment["page_fragment"],
                           "start": segment["source_start"] + left - segment["start"],
                           "end": segment["source_start"] + right - segment["start"]})
    return result


def subsegments(segments, start: int, end: int):
    """Rebase logical offsets while preserving original page-local offsets."""
    result = []
    for segment in segments:
        left, right = max(start, segment["start"]), min(end, segment["end"])
        if left < right:
            result.append({**segment, "start": left - start, "end": right - start,
                           "source_start": segment["source_start"] + left - segment["start"]})
    return result


def logical_chunk(text, page, section="", *, metadata=None, prefix="", repeat="", segments=None, **flags):
    return Chunk(text=text, page=page, chunk_index=0, section=section, source_text=text,
                 metadata={**(metadata or {}), "_prefix": prefix, "_repeat": repeat,
                           "_segments": segments or []}, **flags)


def slice_asset_metadata(metadata, start, end, *, offset=0):
    """Rebase asset occurrences whenever source text is sliced, including tables."""
    result = dict(metadata)
    for field in ('links', 'images'):
        if not isinstance(metadata.get(field), list):
            continue
        local = []
        for asset in metadata[field]:
            spans_for_asset = asset.get('text_spans') or []
            overlaps = [{'start': max(span['start'], start) - start + offset,
                         'end': min(span['end'], end) - start + offset}
                        for span in spans_for_asset if span['start'] < end and span['end'] > start]
            if overlaps:
                local.append({**asset, 'text_spans': overlaps})
            elif not spans_for_asset and start == 0:
                local.append({**asset, 'context_scope': 'group'})
        result[field] = local
    return result


def finalize(chunks: list[Chunk], cfg: ChunkConfig, filename: str) -> list[Chunk]:
    '''
        Chunk enrichment with metadata and keeps chunks under required limit
    '''
    output = []
    for group_index, chunk in enumerate(chunks):
        body = chunk.source_text or chunk.text
        metadata = {k: v for k, v in chunk.metadata.items() if not k.startswith("_")}
        context = chunk.metadata.get("_prefix", "")
        if cfg.context_enriched:
            context = f"[DOCUMENT BREADCRUMB: {filename} > {chunk.section}]\n" + context
        prefix = _context_prefix(context, cfg)
        repeat = chunk.metadata.get("_repeat", "")
        # A huge source header must remain in the first chunk, but cannot be
        # repeated if doing so would consume most of every chunk's budget.
        if repeat and (token_count(prefix + repeat, cfg) > cfg.max_tokens // 2 or
                       (cfg.chunk_size and len(prefix + repeat) > cfg.chunk_size // 2)):
            repeat = ""
            metadata["repeated_header_omitted"] = True
        segments = chunk.metadata.get("_segments", [])
        split_mode = metadata.get("split_mode") or (
            "record" if metadata.get("record_index") is not None else
            "lines" if metadata.get("block_type") == "code" else
            "rows" if chunk.is_table or metadata.get("row_aware") else "prose"
        )
        metadata["split_mode"] = split_mode
        metadata.setdefault("block_type", "table" if split_mode == "rows" else "code" if split_mode == "lines" else "record" if split_mode == "record" else "text")
        explicit = chunk.metadata.get("_unit_boundaries")
        boundaries = set(_unit_boundaries(body, split_mode, explicit))
        pieces = list(spans(body, cfg, prefix, repeat, split_mode=split_mode, unit_boundaries=explicit))
        row_spans = chunk.metadata.get("_row_spans", [])
        row_starts = [row["start"] for row in row_spans]
        row_ends = [row["end"] for row in row_spans]
        previous_end = 0
        group_start = len(output)
        for start, end, lead, repeated in pieces:
            source = body[start:end]
            if not source.strip():
                continue
            locations = slice_segments(segments, start, end)
            source_page = locations[0]["page"] if locations else chunk.page
            if repeated:
                locations = slice_segments(segments, 0, len(repeated)) + locations
            text = lead + source
            meta = {**slice_asset_metadata(metadata, start, end, offset=len(repeated)), "chunking_version": CHUNKING_VERSION,
                    "token_count": token_count(text, cfg), "tokenizer": cfg.tokenizer_name,
                    "source_spans": locations, "group_index": group_index,
                    "continues_previous": previous_end not in boundaries,
                    "continues_next": end not in boundaries,
                    "repeated_header": bool(repeated),
                    "repeated_header_characters": len(repeated)}
            row_indices = [row["row_index"] for row in row_spans[
                bisect_right(row_ends, start):bisect_left(row_starts, end)
            ]]
            if row_indices:
                meta.update(row_start=min(row_indices), row_end=max(row_indices))
            if locations:
                meta["page_end"] = locations[-1]["page"]
            output.append(replace(chunk, text=text, source_text=repeated + source,
                                  page=source_page,
                                  chunk_index=len(output), metadata=meta))
            previous_end = end
        # Link only emitted siblings: skipped whitespace must not create broken
        # pointers, and the first/last fragment must not link to another group.
        group_end = len(output)
        for index in range(group_start, group_end):
            meta = output[index].metadata
            meta.update(
                fragment_index=index - group_start,
                fragment_count=group_end - group_start,
                previous_chunk_index=index - 1 if index > group_start else -1,
                next_chunk_index=index + 1 if index + 1 < group_end else -1,
                continues_previous=bool(meta["continues_previous"] and index > group_start),
                continues_next=bool(meta["continues_next"] and index + 1 < group_end),
            )
            if metadata.get("record_index") is not None:
                meta["record_fragment"] = group_end - group_start > 1
    return output


def add_context(chunk: Chunk, context: str, cfg: ChunkConfig) -> None:
    """Fit optional generated context without changing raw evidence or IDs."""
    while context and not fits(f"[Context: {context}]\n" + chunk.text, cfg):
        context = context[:max(0, len(context) * 3 // 4)].rstrip()
    if context:
        chunk.text = f"[Context: {context}]\n" + chunk.text
    chunk.metadata["token_count"] = token_count(chunk.text, cfg)

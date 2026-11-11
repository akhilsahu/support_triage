"""Chunk Markdown by semantic blocks while retaining exact local assets."""
from __future__ import annotations

from typing import List
from urllib.parse import urlsplit
import structlog

from app.orchestra.ai.config import ChunkConfig
from app.orchestra.ai.ingestion.chunking.sizing import joined_pages, logical_chunk, token_count
from app.orchestra.ai.core.document_models import Chunk, ParsedDocument
from app.orchestra.ai.ingestion.chunking.strategies.table_rows import table_blocks


def _is_content_destination(destination: str) -> bool:
    try:
        parsed = urlsplit(destination)
    except ValueError:
        return False
    return parsed.path not in ("", "/") or bool(parsed.query)


def _destinations(metadata: dict) -> set[str]:
    destinations = {
        str(link.get("url"))
        for link in metadata.get("links", [])
        if isinstance(link, dict) and link.get("url")
    }
    destinations.update(
        str(image.get("destination_url"))
        for image in metadata.get("images", [])
        if isinstance(image, dict) and image.get("destination_url")
    )
    # Repeated homepage/fragment destinations are navigation, not evidence
    # that neighbouring content blocks describe the same item.
    return {
        destination
        for destination in destinations
        if _is_content_destination(destination)
    }


def _merge_assets(groups: list[dict], key: str) -> list[dict]:
    unique = []
    for group in groups:
        for item in group["metadata"].get(key, []):
            if not isinstance(item, dict) or not item.get("url"):
                continue
            # Retain differing disclosure/provenance attributes on the same URL.
            if item not in unique:
                unique.append(dict(item))
    return unique


def _discovered_references(metadata: dict) -> bool:
    """The scraper's generated appendix is one reference list, not product cards."""
    links = metadata.get('links') or []
    return bool(links) and not metadata.get('images') and all(
        isinstance(link, dict) and link.get('title') == 'Discovered page link' for link in links
    )


def chunk_markdown_blocks(doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
    """Keep asset blocks atomic and merge only demonstrably related blocks."""
    groups: list[dict] = []
    for fragment, page in enumerate(doc.pages):
        text = page.text
        if not text.strip():
            continue
        metadata = page.metadata or {}
        candidate = {
            "texts": [text],
            "pages": [page.page],
            "section": (page.section or "").strip(),
            "metadata": metadata,
            "source_pages": [(fragment, page)],
        }
        previous = groups[-1] if groups else None
        shared_destination = (
            previous
            and _destinations(previous["metadata"])
            and bool(_destinations(previous["metadata"]) & _destinations(metadata))
        )
        both_plain = (
            previous
            and previous["metadata"].get("block_type") != "code"
            and metadata.get("block_type") != "code"
            and not _destinations(previous["metadata"])
            and not previous["metadata"].get("images")
            and not _destinations(metadata)
            and not metadata.get("images")
        )
        combined = "\n\n".join([*previous["texts"], text]) if previous else text
        short_tail = (cfg.orphan_tokens and not metadata.get('links') and not metadata.get('images')
                      and metadata.get('block_type') != 'code' and token_count(text, cfg) < cfg.orphan_tokens)
        previous_tokens = token_count("\n\n".join(previous["texts"]), cfg) if previous and cfg.target_tokens else 0
        fits = previous and (not cfg.chunk_size or len(combined) <= cfg.chunk_size)
        if cfg.target_tokens:
            header_tokens = token_count(candidate['section'] + '\n\n', cfg) if cfg.keep_section_header else 0
            fits = fits and token_count(combined, cfg) + header_tokens <= cfg.max_tokens and (previous_tokens < cfg.target_tokens or short_tail)
            # The storage adapter preserves at most twenty local assets per
            # chunk. Do not merge away reference destinations beyond that cap.
            if previous:
                fits = fits and all(len(_merge_assets([previous, candidate], key)) <= 20 for key in ('links', 'images'))
        # A short prose sibling may accompany a linked block. Two independent
        # linked/media cards still require a shared destination before merging.
        short_sibling = (previous and cfg.min_tokens and previous_tokens < cfg.min_tokens
                         and not previous['metadata'].get('images') and not metadata.get('images')
                         and (not _destinations(previous['metadata']) or not _destinations(metadata)))
        reference_siblings = (cfg.target_tokens and previous and _discovered_references(previous['metadata'])
                              and _discovered_references(metadata))
        isolated = (metadata.get("block_type") == "code" or bool(table_blocks(text))
                    or (previous and (previous["metadata"].get("block_type") == "code"
                                      or bool(table_blocks("\n\n".join(previous["texts"]))))))
        excluded_keys = {"block_type", "heading_path", "links", "images"}
        compatible_metadata = previous and (
            (previous["metadata"].get("heading_path") or []) == (metadata.get("heading_path") or [])
            and {key: value for key, value in previous["metadata"].items() if key not in excluded_keys}
            == {key: value for key, value in metadata.items() if key not in excluded_keys}
        )
        if previous and compatible_metadata and not isolated and fits and previous["section"] == candidate["section"] and (shared_destination or both_plain or short_sibling or reference_siblings or short_tail):
            previous["texts"].append(text)
            previous["pages"].append(page.page)
            previous["source_pages"].append((fragment, page))
            merged_links = _merge_assets([previous, candidate], "links")
            merged_images = _merge_assets([previous, candidate], "images")
            previous["metadata"] = {
                **previous["metadata"],
                "block_type": "media" if merged_images else "linked_text" if merged_links else "text",
                "heading_path": previous["metadata"].get("heading_path") or metadata.get("heading_path") or [],
                "links": merged_links,
                "images": merged_images,
            }
        else:
            groups.append(candidate)

    if cfg.target_tokens:
        structlog.get_logger(__name__).info('chunking.markdown.grouped', blocks=len(doc.pages),
                                           groups=len(groups), target_tokens=cfg.target_tokens,
                                           orphan_tokens=cfg.orphan_tokens)
    chunks: List[Chunk] = []
    for group in groups:
        body, segments = joined_pages(group["source_pages"])
        header = group["section"]
        if group["metadata"].get("block_type") != "code" and table_blocks(body):
            from app.orchestra.ai.ingestion.chunking.strategies.by_structure import chunk_tables
            chunks.extend(chunk_tables(body, segments, group["pages"][0], header, group["metadata"], cfg))
            continue
        prefix = f"{header}\n\n" if cfg.keep_section_header and header and not body.casefold().startswith(header.casefold()) else ""
        chunks.append(logical_chunk(body, group["pages"][0], header,
                                    metadata=group["metadata"], prefix=prefix, segments=segments))
    return chunks

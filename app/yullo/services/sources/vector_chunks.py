from __future__ import annotations

import json
import asyncio
import re
import uuid
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.models.knowledge_base import KnowledgeBaseItem
from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.orchestra.ai.knowledge.vector_store import get_vector_store
from app.yullo.schemas.knowledge import (
    VectorChunkImage, VectorChunkLink, VectorChunkItem, VectorSourceSummary, VectorChunksResponse,
)

logger = structlog.get_logger()

# Regex to detect markdown linked images and standard markdown images
_LINKED_IMG_RE = re.compile(r'\[\!\[(.*?)\]\((https?://[^\s\)]+)\)\]\((https?://[^\s\)]+)\)')
_STANDARD_IMG_RE = re.compile(r'(?<!\[)\!\[(.*?)\]\((https?://[^\s\)]+)\)')


async def _require_space_owner(
    db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID
) -> YulloSpace:
    stmt = (
        select(YulloSpace)
        .join(Space, YulloSpace.space_id == Space.id)
        .where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo")
    )
    yullo_space = await db.scalar(stmt)
    if not yullo_space:
        raise HTTPException(status_code=403, detail="Not authorized or Yullo space not found")
    return yullo_space


def _extract_images_from_text(text: str) -> list[VectorChunkImage]:
    images: list[VectorChunkImage] = []
    seen = set()

    # 1. Linked images: [![alt](img)](dest)
    for alt, img_url, dest_url in _LINKED_IMG_RE.findall(text):
        if img_url not in seen:
            images.append(VectorChunkImage(
                url=img_url,
                alt=alt.strip(),
                destination_url=dest_url.strip(),
            ))
            seen.add(img_url)

    # 2. Standard markdown images: ![alt](img)
    for alt, img_url in _STANDARD_IMG_RE.findall(text):
        if img_url not in seen:
            images.append(VectorChunkImage(
                url=img_url,
                alt=alt.strip(),
                destination_url=None,
            ))
            seen.add(img_url)

    return images


def _extract_images_from_meta_and_text(meta: dict[str, Any], text: str) -> list[VectorChunkImage]:
    raw_images_json = meta.get("images_json")
    if raw_images_json and isinstance(raw_images_json, str):
        try:
            parsed = json.loads(raw_images_json)
            if isinstance(parsed, list):
                images = []
                seen = set()
                for item in parsed:
                    if not isinstance(item, dict) or not item.get("url") or item["url"] in seen:
                        continue
                    images.append(VectorChunkImage(
                        url=item["url"],
                        alt=str(item.get("alt") or ""),
                        title=str(item["title"]) if item.get("title") else None,
                        destination_url=item.get("destination_url"),
                    ))
                    seen.add(item["url"])
                return images
        except (TypeError, ValueError):
            pass
    return _extract_images_from_text(text)


def _extract_links_from_meta_and_text(meta: dict[str, Any], text: str) -> list[VectorChunkLink]:
    links: list[VectorChunkLink] = []
    seen = set()

    # Read from links_json in ChromaDB metadata
    raw_links_json = meta.get("links_json")
    if raw_links_json and isinstance(raw_links_json, str):
        try:
            parsed = json.loads(raw_links_json)
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict) and item.get("url"):
                        u = item["url"]
                        if u not in seen:
                            links.append(VectorChunkLink(title=item.get("title") or "Link", url=u))
                            seen.add(u)
        except Exception:
            pass

    # Fallback: scan markdown links in text
    if not links and text:
        for title, u in re.findall(r'(?<!\!)\[(.*?)\]\((https?://[^\s\)]+)\)', text):
            if u not in seen:
                links.append(VectorChunkLink(title=title.strip() or "Link", url=u.strip()))
                seen.add(u)

    return links


async def get_space_vector_chunks(
    db: AsyncSession,
    *,
    space_id: uuid.UUID,
    user_id: uuid.UUID,
    source_id: Optional[uuid.UUID] = None,
    limit: int = 600,
) -> VectorChunksResponse:
    """
    Retrieve vector chunks and metadata from ChromaDB for a given Space.
    Supports filtering by specific source_id or viewing all sources.
    """
    await _require_space_owner(db, space_id, user_id)

    # 1. Fetch all knowledge items for this space from Postgres
    stmt = (
        select(KnowledgeBaseItem)
        .where(KnowledgeBaseItem.space_id == space_id)
        .order_by(KnowledgeBaseItem.created_at.desc())
    )
    kb_items = (await db.scalars(stmt)).all()

    # Map doc_id and source_id to source titles and metadata
    source_by_id: dict[str, KnowledgeBaseItem] = {str(item.id): item for item in kb_items}
    source_by_doc_id: dict[str, KnowledgeBaseItem] = {}
    doc_ids_by_source: dict[str, set[str]] = {}
    for item in kb_items:
        # Retain legacy IDs and the in-progress current version, but never
        # treat rows without a current source record as that source's data.
        doc_ids = {value for value in (
            item.indexed_doc_id, item.doc_id,
            f"preview:{item.id}:v{item.source_version or 1}",
            f"knowledge:{item.id}:v{item.source_version or 1}",
            f"knowledge:{item.id}",
        ) if value}
        doc_ids_by_source[str(item.id)] = doc_ids
        for doc_id in doc_ids:
            source_by_doc_id[doc_id] = item

    # 2. Query ChromaDB for this space
    store = get_vector_store()
    selected_source_item = source_by_id.get(str(source_id)) if source_id else None
    if source_id and selected_source_item is None:
        raise HTTPException(status_code=404, detail='Source not found in this Space')
    allowed_doc_ids = (doc_ids_by_source[str(selected_source_item.id)]
                       if selected_source_item else set(source_by_doc_id))
    results = await asyncio.to_thread(store.read_client_chunks, str(space_id),
                                      doc_ids=sorted(allowed_doc_ids), limit=limit)

    ids = results.get("ids", [])
    documents = results.get("documents", [])
    metadatas = results.get("metadatas", [])

    # Count chunks per doc_id to build source summaries
    chunk_count_by_doc_id: dict[str, int] = {}
    for meta in metadatas:
        d_id = meta.get("doc_id", "")
        if d_id:
            chunk_count_by_doc_id[d_id] = chunk_count_by_doc_id.get(d_id, 0) + 1

    # 3. Build Source Summaries
    source_summaries: list[VectorSourceSummary] = []
    for item in kb_items:
        d_id = item.indexed_doc_id or item.doc_id
        c_count = sum(chunk_count_by_doc_id.get(doc_id, 0) for doc_id in doc_ids_by_source[str(item.id)])
        assets = (item.source_metadata or {}).get("assets", {})
        imgs = assets.get("images", []) if isinstance(assets, dict) else []

        target_url = item.source_locator or (item.source_metadata or {}).get("target_url") or (item.source_metadata or {}).get("url")
        source_summaries.append(VectorSourceSummary(
            source_id=str(item.id),
            title=item.title or f"Source {str(item.id)[:8]}",
            indexed_doc_id=d_id,
            target_url=target_url,
            chunk_count=c_count,
            images_count=len(imgs),
            created_at=item.created_at.isoformat() if item.created_at else None,
            ingestion_status=item.ingestion_status,
            is_confirmed=bool((item.source_metadata or {}).get('is_confirmed', False)),
            indexing_status=(item.source_metadata or {}).get('indexing_status'),
        ))

    # 4. Build Chunk Items
    chunk_items: list[VectorChunkItem] = []
    for cid, doc, meta in zip(ids, documents, metadatas):
        d_id = meta.get("doc_id", "")
        src_item = source_by_doc_id.get(d_id)
        source_title = src_item.title if src_item else meta.get("doc_name") or meta.get("filename") or d_id
        src_id_str = str(src_item.id) if src_item else None

        source_text = meta.get("source_text") or doc
        images = _extract_images_from_meta_and_text(meta, source_text)
        links = _extract_links_from_meta_and_text(meta, source_text)

        # Exclude large redundant fields from the display metadata dict
        display_meta = {
            k: v for k, v in meta.items()
            if k not in ("source_text", "links_json", "images_json", "heading_path_json", "client_id", "session_id")
        }

        chunk_items.append(VectorChunkItem(
            id=cid,
            chunk_index=meta.get("chunk_index", 0),
            page=meta.get("page", 1),
            section=meta.get("section", ""),
            doc_id=d_id,
            source_id=src_id_str,
            source_title=source_title,
            text=doc,
            source_text=source_text,
            images=images,
            links=links,
            metadata=display_meta,
            is_table=bool(meta.get("is_table", False)),
            is_table_row=bool(meta.get("is_table_row", False)),
            row_label=meta.get("row_label"),
            token_estimate=len(doc.split()),
        ))

    # Sort chunks by chunk_index
    chunk_items.sort(key=lambda c: (c.page, c.chunk_index))

    # Curated images for the selected source if available
    curated_source_images: list[dict[str, Any]] = []
    if selected_source_item and selected_source_item.source_metadata:
        assets = selected_source_item.source_metadata.get("assets", {})
        if isinstance(assets, dict) and assets.get("images"):
            curated_source_images = assets["images"]

    logger.info(
        "vector_chunks.retrieved",
        space_id=str(space_id),
        source_id=str(source_id) if source_id else "all",
        chunks_count=len(chunk_items),
        sources_count=len(source_summaries),
    )

    return VectorChunksResponse(
        sources=source_summaries,
        selected_source_id=str(source_id) if source_id else None,
        total_chunks=len(ids),
        filtered_chunks_count=len(chunk_items),
        chunks=chunk_items,
        source_images=curated_source_images,
    )

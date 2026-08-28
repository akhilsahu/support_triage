"""
Knowledge Base API — CRUD for KnowledgeBase and KnowledgeBaseItem.

Endpoints:
  GET    /space/knowledge-bases              — list all KBs for the space
  POST   /space/knowledge-bases              — create KB
  GET    /space/knowledge-bases/{kb_id}      — get KB with items
  PATCH  /space/knowledge-bases/{kb_id}      — update KB metadata
  DELETE /space/knowledge-bases/{kb_id}      — delete KB + items

  GET    /space/knowledge-bases/{kb_id}/items          — list items
  POST   /space/knowledge-bases/{kb_id}/items          — add item
  DELETE /space/knowledge-bases/{kb_id}/items/{item_id} — remove item
"""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.knowledge_base import AgentKnowledgeBase, KnowledgeBase, KnowledgeBaseItem
from app.models.space import Space
from app.api.auth import current_space

logger = structlog.get_logger()

router = APIRouter(prefix="/space/knowledge-bases", tags=["Knowledge Base"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class KBCreate(BaseModel):
    name:        str
    description: str = ""
    # Inherited by items that don't set their own topic — a KB about one thing
    # sets this once instead of tagging every upload.
    default_topic: Optional[str] = None

class KBUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    default_topic: Optional[str] = None
    active:      Optional[bool] = None

class KBItemCreate(BaseModel):
    # "url" items are created by the scrape pipeline (documents.py), not here —
    # accepted for API completeness so a caller can re-link an already-indexed
    # page, which behaves exactly like "doc".
    item_type: str = Field(..., pattern="^(doc|url|text|qna)$")
    title:     Optional[str] = None
    doc_id:    Optional[str] = None    # for item_type="doc"
    question:  Optional[str] = None   # for item_type="qna"
    content:   Optional[str] = None   # for item_type="text" or "qna" answer
    # Slugified on write. `topic` groups the documents describing one thing so
    # an agent can scope to it; `doc_label` distinguishes them within a topic
    # and becomes the citation label.
    topic:     Optional[str] = None
    doc_label: Optional[str] = None
    description: Optional[str] = ""

class KBOut(BaseModel):
    id:          str
    space_id:    str
    name:        str
    description: str
    default_topic: Optional[str] = None
    active:      bool
    item_count:  int
    created_at:  Optional[str]
    updated_at:  Optional[str]

class KBItemOut(BaseModel):
    id:             str
    kb_id:          str
    item_type:      str
    title:          Optional[str]
    doc_id:         Optional[str]
    topic:          Optional[str] = None
    doc_label:      Optional[str] = None
    description:    Optional[str] = None
    question:       Optional[str]
    content:        Optional[str]
    indexed_doc_id: Optional[str]
    created_at:     Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _kb_out(kb: KnowledgeBase) -> KBOut:
    return KBOut(
        id=str(kb.id),
        space_id=str(kb.space_id),
        name=kb.name,
        description=kb.description or "",
        default_topic=kb.default_topic,
        active=kb.active,
        item_count=len(kb.__dict__.get("items", [])),
        created_at=kb.created_at.isoformat() if kb.created_at else None,
        updated_at=kb.updated_at.isoformat() if kb.updated_at else None,
    )

def _item_out(item: KnowledgeBaseItem) -> KBItemOut:
    return KBItemOut(
        id=str(item.id),
        kb_id=str(item.kb_id),
        item_type=item.item_type,
        title=item.title,
        doc_id=item.doc_id,
        topic=item.topic,
        doc_label=item.doc_label,
        description=item.description,
        question=item.question,
        content=item.content,
        indexed_doc_id=item.indexed_doc_id,
        created_at=item.created_at.isoformat() if item.created_at else None,
    )

async def _tag_doc_with_kb(doc_id: str, kb_id: str, space_id: str) -> None:
    """Backfill kb_id onto all ChromaDB chunks for an already-uploaded document."""
    try:
        from app.rag.vector_store import get_vector_store
        store = get_vector_store()
        col   = store._collection("client_documents")
        results = col.get(where={"$and": [{"client_id": {"$eq": space_id}}, {"doc_id": {"$eq": doc_id}}]}, include=["metadatas"])
        ids = results.get("ids", [])
        if not ids:
            logger.warning("kb_item.doc_not_found_in_chroma", doc_id=doc_id, space_id=space_id)
            return
        new_meta = [{**m, "kb_id": kb_id} for m in (results.get("metadatas") or [])]
        col.update(ids=ids, metadatas=new_meta)
        logger.info("kb_item.doc_tagged", doc_id=doc_id, kb_id=kb_id, chunks=len(ids))
    except Exception as e:
        logger.error("kb_item.tag_error", doc_id=doc_id, kb_id=kb_id, error=str(e))


async def _index_kb_item(item: KnowledgeBaseItem, space: Space, kb: KnowledgeBase, description: str = "") -> None:
    """Index a text/qna KB item into ChromaDB and write indexed_doc_id back."""
    try:
        import uuid as _uuid
        from app.rag.vector_store import get_vector_store
        from app.core.database import AsyncSessionLocal

        text = item.content or ""
        if item.item_type == "qna":
            text = f"Q: {item.question}\nA: {item.content}"
        if not text.strip():
            return

        title = str(item.title or f"kb-{str(item.id)[:8]}")

        # Short items and Q&A stay as ONE atomic chunk — a Q&A pair must never be
        # split (question would separate from its answer), and short text has no
        # need to chunk. Long free-text items go through the chunker so retrieval
        # is granular instead of returning a wall of text.
        INLINE_MAX = 1200
        if item.item_type == "qna" or len(text) <= INLINE_MAX:
            strategy = "inline"
            chunks_payload = [{"text": text, "page": 1, "chunk_index": 0, "section": title}]
        else:
            from app.orchestra.ai.chunking import chunk as chunk_document, get_config as get_chunk_config
            from app.rag.document_parser import ParsedDocument, ParsedPage
            parsed = ParsedDocument(
                filename="kb.txt",   # RECURSIVE text strategy
                extension=".txt",
                pages=[ParsedPage(page=1, text=text, section=title)],
            )
            strategy = get_chunk_config(parsed.filename).strategy.value
            chunks_payload = [
                {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section or title}
                for c in chunk_document(parsed)
            ] or [{"text": text, "page": 1, "chunk_index": 0, "section": title}]

        idx_doc_id = str(_uuid.uuid4())[:8]
        store = get_vector_store()
        store.upsert_client_chunks(
            client_id=str(space.id),
            session_id="kb",
            doc_id=idx_doc_id,
            filename=title,
            extension=".txt",
            strategy=strategy,
            doc_type="general",
            ttl_days=None,
            kb_id=str(kb.id),
            kb_name=str(kb.name),
            space_id=str(space.id),
            org_name=getattr(space, "display_name", ""),
            description=description,
            topic=item.topic or "",
            chunks=chunks_payload,
        )

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == item.id)
            )
            row = result.scalar_one_or_none()
            if row:
                row.indexed_doc_id = idx_doc_id  # type: ignore[assignment]
                await db.commit()
        logger.info("kb_item.indexed", item_id=str(item.id), doc_id=idx_doc_id)
    except Exception as e:
        logger.warning("kb_item.index_failed", item_id=str(item.id), error=str(e))


async def _apply_topic(item: KnowledgeBaseItem, space: Space,
                       topic: Optional[str], doc_label: Optional[str],
                       description: Optional[str] = None) -> None:
    """
    Persist a topic/label/description on the item AND re-stamp its ChromaDB chunks.

    Both halves are mandatory. Retrieval filters on the copy in chunk metadata,
    so writing only the Postgres column leaves a topic-scoped agent matching
    nothing — and because that is a filter miss rather than an error, it
    presents as a missing document rather than a stale tag.
    """
    from app.rag.vector_store import get_vector_store
    from app.utils.slug import slugify

    if topic is not None:
        item.topic = slugify(topic) or None
    if doc_label is not None:
        item.doc_label = doc_label.strip() or None
    if description is not None:
        item.description = description.strip() or None

    doc_id = item.doc_id or item.indexed_doc_id
    if not doc_id:
        return                       # text/qna not indexed yet — stamped at index time
    try:
        get_vector_store().retag_doc(
            client_id=str(space.id),
            doc_id=doc_id,
            topic=item.topic or "" if topic is not None else None,
            doc_label=item.doc_label or "" if doc_label is not None else None,
            description=item.description or "" if description is not None else None,
        )
    except Exception as e:
        # The row is already correct; a failure here only means retrieval keeps
        # the old tag until the next edit. Loud, because it is silent otherwise.
        logger.error("kb_item.retag_failed", item_id=str(item.id), doc_id=doc_id, error=str(e))


def _invalidate(space: Space) -> None:
    """Agents cache their prompts and filters for 1800s — an edit is invisible until this."""
    try:
        from app.orchestra.ai.session.pool import pool
        pool.invalidate_bot_agents(str(space.id))
    except Exception as e:
        logger.warning("kb.pool_invalidate_failed", space_id=str(space.id), error=str(e))


async def _get_kb(kb_id: UUID, space: Space, db: AsyncSession) -> KnowledgeBase:
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.items))
        .where(KnowledgeBase.id == kb_id, KnowledgeBase.space_id == space.id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(404, "Knowledge base not found.")
    return kb


# ── KB endpoints ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[KBOut])
async def list_knowledge_bases(
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.items))
        .where(KnowledgeBase.space_id == space.id)
        .order_by(KnowledgeBase.created_at.desc())
    )
    return [_kb_out(kb) for kb in result.scalars().all()]


@router.post("", response_model=KBOut, status_code=201)
async def create_knowledge_base(
    req:   KBCreate,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    from app.utils.slug import slugify
    kb = KnowledgeBase(
        space_id=space.id,
        name=req.name,
        description=req.description,
        default_topic=slugify(req.default_topic or "") or None,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    logger.info("knowledge_base.created", space_id=str(space.id), kb_id=str(kb.id))
    return _kb_out(kb)


@router.get("/{kb_id}", response_model=KBOut)
async def get_knowledge_base(
    kb_id: UUID,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    return _kb_out(await _get_kb(kb_id, space, db))


@router.patch("/{kb_id}", response_model=KBOut)
async def update_knowledge_base(
    kb_id: UUID,
    req:   KBUpdate,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    kb = await _get_kb(kb_id, space, db)
    if req.name        is not None: kb.name        = req.name
    if req.description is not None: kb.description = req.description
    if req.active      is not None: kb.active      = req.active
    if req.default_topic is not None:
        from app.utils.slug import slugify
        kb.default_topic = slugify(req.default_topic) or None
    await db.commit()
    await db.refresh(kb)
    _invalidate(space)
    return _kb_out(kb)


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(
    kb_id: UUID,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    kb = await _get_kb(kb_id, space, db)
    await db.delete(kb)
    await db.commit()
    logger.info("knowledge_base.deleted", space_id=str(space.id), kb_id=str(kb_id))


# ── Item endpoints ────────────────────────────────────────────────────────────

@router.get("/{kb_id}/items", response_model=List[KBItemOut])
async def list_items(
    kb_id: UUID,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    kb = await _get_kb(kb_id, space, db)
    return [_item_out(i) for i in kb.items]


@router.post("/{kb_id}/items", response_model=KBItemOut, status_code=201)
async def add_item(
    kb_id: UUID,
    req:   KBItemCreate,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, space, db)   # ownership check

    # "url" is a presentation variant of "doc" — same doc_id contract.
    if req.item_type in ("doc", "url") and not req.doc_id:
        raise HTTPException(400, f"doc_id required for item_type='{req.item_type}'.")
    if req.item_type == "qna" and not req.question:
        raise HTTPException(400, "question required for item_type='qna'.")
    if req.item_type == "text" and not req.content:
        raise HTTPException(400, "content required for item_type='text'.")

    kb_for_default = await _get_kb(kb_id, space, db)
    from app.utils.slug import slugify
    item = KnowledgeBaseItem(
        kb_id=kb_id,
        item_type=req.item_type,
        title=req.title,
        doc_id=req.doc_id,
        description=req.description,
        # An untagged item inherits the KB's default, so a KB about one thing is
        # tagged once rather than per upload.
        topic=slugify(req.topic or "") or kb_for_default.default_topic,
        doc_label=(req.doc_label or "").strip() or None,
        question=req.question,
        content=req.content,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    kb = await _get_kb(kb_id, space, db)
    if req.item_type in ("text", "qna"):
        await _index_kb_item(item, space, kb, description=req.description or "")
    elif req.item_type in ("doc", "url") and req.doc_id:
        # Backfill kb_id onto already-uploaded ChromaDB chunks so KB-scoped
        # retrieval can filter by kb_id at query time.
        await _tag_doc_with_kb(doc_id=req.doc_id, kb_id=str(kb_id), space_id=str(space.id))
        if item.topic or item.doc_label or item.description:
            await _apply_topic(item, space, item.topic, item.doc_label, item.description)
            await db.commit()

    _invalidate(space)
    logger.info("kb_item.added", kb_id=str(kb_id), item_type=req.item_type, topic=item.topic)
    return _item_out(item)


class KBItemUpdate(BaseModel):
    question:    Optional[str] = None
    content:     Optional[str] = None
    title:       Optional[str] = None
    topic:       Optional[str] = None
    doc_label:   Optional[str] = None
    description: Optional[str] = None


@router.patch("/{kb_id}/items/{item_id}", response_model=KBItemOut)
async def update_item(
    kb_id:   UUID,
    item_id: UUID,
    req:     KBItemUpdate,
    space:   Space = Depends(current_space),
    db:      AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, space, db)
    result = await db.execute(
        select(KnowledgeBaseItem).where(
            KnowledgeBaseItem.id == item_id,
            KnowledgeBaseItem.kb_id == kb_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found.")
    if req.question is not None: item.question = req.question
    if req.content  is not None: item.content  = req.content
    if req.title    is not None: item.title     = req.title
    if req.description is not None: item.description = req.description
    if req.topic is not None or req.doc_label is not None or req.description is not None:
        await _apply_topic(item, space, req.topic, req.doc_label, req.description)
    await db.commit()
    await db.refresh(item)
    _invalidate(space)
    return _item_out(item)


@router.delete("/{kb_id}/items/{item_id}", status_code=204)
async def delete_item(
    kb_id:   UUID,
    item_id: UUID,
    space:   Space = Depends(current_space),
    db:      AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, space, db)   # ownership check
    result = await db.execute(
        select(KnowledgeBaseItem).where(
            KnowledgeBaseItem.id == item_id,
            KnowledgeBaseItem.kb_id == kb_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found.")
    await db.delete(item)
    await db.commit()

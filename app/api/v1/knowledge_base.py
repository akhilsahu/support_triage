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

class KBUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    active:      Optional[bool] = None

class KBItemCreate(BaseModel):
    item_type: str = Field(..., pattern="^(doc|text|qna)$")
    title:     Optional[str] = None
    doc_id:    Optional[str] = None    # for item_type="doc"
    question:  Optional[str] = None   # for item_type="qna"
    content:   Optional[str] = None   # for item_type="text" or "qna" answer

class KBOut(BaseModel):
    id:          str
    space_id:    str
    name:        str
    description: str
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
        question=item.question,
        content=item.content,
        indexed_doc_id=item.indexed_doc_id,
        created_at=item.created_at.isoformat() if item.created_at else None,
    )

async def _index_kb_item(item: KnowledgeBaseItem, space: Space, kb: KnowledgeBase) -> None:
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

        idx_doc_id = str(_uuid.uuid4())[:8]
        store = get_vector_store()
        store.upsert_client_chunks(
            client_id=str(space.id),
            session_id="kb",
            doc_id=idx_doc_id,
            filename=str(item.title or f"kb-{str(item.id)[:8]}"),
            extension=".txt",
            strategy="inline",
            doc_type="general",
            ttl_days=None,
            kb_id=str(kb.id),
            kb_name=str(kb.name),
            space_id=str(space.id),
            org_name=getattr(space, "display_name", ""),
            chunks=[{"text": text, "page": 1, "chunk_index": 0, "section": ""}],
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
    kb = KnowledgeBase(
        space_id=space.id,
        name=req.name,
        description=req.description,
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
    await db.commit()
    await db.refresh(kb)
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

    if req.item_type == "doc" and not req.doc_id:
        raise HTTPException(400, "doc_id required for item_type='doc'.")
    if req.item_type == "qna" and not req.question:
        raise HTTPException(400, "question required for item_type='qna'.")
    if req.item_type == "text" and not req.content:
        raise HTTPException(400, "content required for item_type='text'.")

    item = KnowledgeBaseItem(
        kb_id=kb_id,
        item_type=req.item_type,
        title=req.title,
        doc_id=req.doc_id,
        question=req.question,
        content=req.content,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    if req.item_type in ("text", "qna"):
        kb = await _get_kb(kb_id, space, db)
        await _index_kb_item(item, space, kb)

    logger.info("kb_item.added", kb_id=str(kb_id), item_type=req.item_type)
    return _item_out(item)


class KBItemUpdate(BaseModel):
    question: Optional[str] = None
    content:  Optional[str] = None
    title:    Optional[str] = None


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
    await db.commit()
    await db.refresh(item)
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

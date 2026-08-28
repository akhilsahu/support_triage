"""
Facts API — the editable layer over retrieval.

  GET    /space/knowledge-bases/{kb_id}/facts          — list
  POST   /space/knowledge-bases/{kb_id}/facts          — add by hand
  POST   /space/knowledge-bases/{kb_id}/facts/extract  — propose from a document
  PATCH  /space/knowledge-bases/{kb_id}/facts/{id}     — edit / confirm
  DELETE /space/knowledge-bases/{kb_id}/facts/{id}     — remove

Extraction proposes; a human confirms. Nothing unverified is ever shown to an
agent — see app/models/kb_fact.py for why that gate is not optional.
"""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import current_space
from app.core.database import get_db
from app.models.kb_fact import KBFact
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.space import Space

logger = structlog.get_logger()

router = APIRouter(prefix="/space/knowledge-bases", tags=["Knowledge Base Facts"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class FactCreate(BaseModel):
    subject: str
    label:   str
    value:   str
    note:    Optional[str] = None
    topic:   Optional[str] = None
    source_doc_id:   Optional[str] = None
    source_filename: Optional[str] = None
    source_page:     Optional[int] = None
    # Hand-entered facts are trusted — someone typed them deliberately. Only
    # extracted ones start unverified.
    verified: bool = True

class FactUpdate(BaseModel):
    subject:  Optional[str]  = None
    label:    Optional[str]  = None
    value:    Optional[str]  = None
    note:     Optional[str]  = None
    topic:    Optional[str]  = None
    verified: Optional[bool] = None

class ExtractRequest(BaseModel):
    doc_id: str

class FactOut(BaseModel):
    id:      str
    kb_id:   str
    topic:   Optional[str]
    subject: str
    label:   str
    value:   str
    note:    Optional[str]
    source_doc_id:   Optional[str]
    source_filename: Optional[str]
    source_page:     Optional[int]
    verified:   bool
    created_at: Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_kb(kb_id: UUID, space: Space, db: AsyncSession) -> KnowledgeBase:
    kb = (await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id, KnowledgeBase.space_id == space.id
        )
    )).scalar_one_or_none()
    if not kb:
        raise HTTPException(404, "Knowledge base not found.")
    return kb


async def _get_fact(fact_id: UUID, kb_id: UUID, db: AsyncSession) -> KBFact:
    fact = (await db.execute(
        select(KBFact).where(KBFact.id == fact_id, KBFact.kb_id == kb_id)
    )).scalar_one_or_none()
    if not fact:
        raise HTTPException(404, "Fact not found.")
    return fact


def _invalidate(space: Space) -> None:
    """Facts live in the system prompt, which is frozen when the runner is pooled."""
    try:
        from app.orchestra.ai.session.pool import pool
        pool.invalidate_bot_agents(str(space.id))
    except Exception as e:
        logger.warning("facts.pool_invalidate_failed", space_id=str(space.id), error=str(e))


def _out(f: KBFact) -> FactOut:
    return FactOut(**f.to_dict())


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{kb_id}/facts", response_model=List[FactOut])
async def list_facts(
    kb_id: UUID,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, space, db)
    rows = (await db.execute(
        select(KBFact).where(KBFact.kb_id == kb_id)
        # Unconfirmed first: they are the ones needing action, and burying them
        # under confirmed rows is how an extraction run gets forgotten.
        .order_by(KBFact.verified.asc(), KBFact.subject.asc(), KBFact.label.asc())
    )).scalars().all()
    return [_out(f) for f in rows]


@router.post("/{kb_id}/facts", response_model=FactOut, status_code=201)
async def create_fact(
    kb_id: UUID,
    req:   FactCreate,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    from app.utils.slug import slugify

    await _get_kb(kb_id, space, db)
    if not (req.subject.strip() and req.label.strip() and req.value.strip()):
        raise HTTPException(400, "subject, label and value are required.")

    fact = KBFact(
        kb_id=kb_id,
        space_id=space.id,
        topic=slugify(req.topic or "") or None,
        subject=req.subject.strip(),
        label=req.label.strip(),
        value=req.value.strip(),
        note=(req.note or "").strip() or None,
        source_doc_id=req.source_doc_id,
        source_filename=req.source_filename,
        source_page=req.source_page,
        verified=req.verified,
    )
    db.add(fact)
    await db.commit()
    await db.refresh(fact)
    _invalidate(space)
    return _out(fact)


@router.post("/{kb_id}/facts/extract", response_model=List[FactOut], status_code=201)
async def extract(
    kb_id: UUID,
    req:   ExtractRequest,
    space: Space = Depends(current_space),
    db:    AsyncSession = Depends(get_db),
):
    """
    Propose facts from one indexed document.

    Everything created here is `verified=False` and invisible to agents until
    confirmed.

    Re-running REPLACES this document's unreviewed proposals and keeps every
    confirmed one. That is deliberate: extraction is not deterministic — a
    second pass over the same document reliably returns a different subset, so
    "skip what already exists" still accumulates variants and buries the
    reviewer. Replacing means the pending list is always one run's worth of
    output, and re-running after fixing a parse is a safe thing to do.
    """
    from app.orchestra.ai.facts import extract_facts

    await _get_kb(kb_id, space, db)

    # Only a document already in THIS kb may be extracted — otherwise a caller
    # could read any doc_id in the space through a KB they happen to own.
    owns = (await db.execute(
        select(KnowledgeBaseItem).where(
            KnowledgeBaseItem.kb_id == kb_id,
            KnowledgeBaseItem.doc_id == req.doc_id,
        )
    )).scalar_one_or_none()
    if not owns:
        raise HTTPException(404, "Document not found in this knowledge base.")

    known = [t for (t,) in (await db.execute(
        select(KnowledgeBaseItem.topic).where(
            KnowledgeBaseItem.kb_id == kb_id, KnowledgeBaseItem.topic.isnot(None)
        ).distinct()
    )).all()]

    def _key(subject: str, value: str) -> tuple:
        norm = lambda s: "".join(ch for ch in (s or "").lower() if ch.isalnum())
        return (norm(subject), norm(value))

    rows = (await db.execute(select(KBFact).where(KBFact.kb_id == kb_id))).scalars().all()

    # Clear this document's previous unreviewed proposals; confirmed facts and
    # other documents' proposals are untouched.
    dropped = 0
    for f in rows:
        if not f.verified and f.source_doc_id == req.doc_id:
            await db.delete(f)
            dropped += 1

    # Still skip anything a human already confirmed, so a re-run never
    # re-proposes a fact that has been reviewed.
    existing = {_key(f.subject, f.value) for f in rows if f.verified}

    try:
        proposed = await extract_facts(str(space.id), req.doc_id, known_topics=known)
    except RuntimeError as e:
        # Surfaced rather than returning []: "no facts found" and "the LLM
        # provider is out of credit" look identical to the user otherwise, and
        # they need completely different actions.
        logger.error("facts.extract.failed", kb_id=str(kb_id), doc_id=req.doc_id, error=str(e))
        raise HTTPException(502, str(e))

    created: List[KBFact] = []
    for p in proposed:
        key = _key(p["subject"], p["value"])
        if key in existing:
            continue
        existing.add(key)
        fact = KBFact(kb_id=kb_id, space_id=space.id, verified=False, **p)
        db.add(fact)
        created.append(fact)

    await db.commit()
    for f in created:
        await db.refresh(f)

    logger.info("facts.extract.stored", kb_id=str(kb_id), doc_id=req.doc_id,
                proposed=len(proposed), created=len(created), replaced=dropped)
    # No _invalidate: nothing here is verified, so nothing reaches an agent yet.
    return [_out(f) for f in created]


@router.patch("/{kb_id}/facts/{fact_id}", response_model=FactOut)
async def update_fact(
    kb_id:   UUID,
    fact_id: UUID,
    req:     FactUpdate,
    space:   Space = Depends(current_space),
    db:      AsyncSession = Depends(get_db),
):
    from app.utils.slug import slugify

    await _get_kb(kb_id, space, db)
    fact = await _get_fact(fact_id, kb_id, db)

    if req.subject  is not None: fact.subject  = req.subject.strip()
    if req.label    is not None: fact.label    = req.label.strip()
    if req.value    is not None: fact.value    = req.value.strip()
    if req.note     is not None: fact.note     = req.note.strip() or None
    if req.topic    is not None: fact.topic    = slugify(req.topic) or None
    if req.verified is not None: fact.verified = req.verified

    await db.commit()
    await db.refresh(fact)
    _invalidate(space)
    return _out(fact)


@router.delete("/{kb_id}/facts/{fact_id}", status_code=204)
async def delete_fact(
    kb_id:   UUID,
    fact_id: UUID,
    space:   Space = Depends(current_space),
    db:      AsyncSession = Depends(get_db),
):
    await _get_kb(kb_id, space, db)
    fact = await _get_fact(fact_id, kb_id, db)
    await db.delete(fact)
    await db.commit()
    _invalidate(space)

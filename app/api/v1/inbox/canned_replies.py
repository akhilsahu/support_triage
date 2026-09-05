"""
Canned replies — per-space quick replies for inbox agents.

GET    /inbox/canned-replies          — list all for the space
POST   /inbox/canned-replies          — create a new canned reply
PUT    /inbox/canned-replies/{id}     — update label/body
DELETE /inbox/canned-replies/{id}     — remove a canned reply
"""

from __future__ import annotations

import structlog
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import current_space
from app.models.inbox import CannedReply

logger = structlog.get_logger()
router = APIRouter(prefix="/inbox", tags=["Inbox — Canned Replies"])


class CannedReplyIn(BaseModel):
    label: str
    body: str


class CannedReplyUpdate(BaseModel):
    label: str | None = None
    body: str | None = None


@router.get("/canned-replies")
async def list_canned_replies(
    space=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CannedReply)
        .where(CannedReply.space_id == space.id)
        .order_by(CannedReply.created_at)
    )
    replies = result.scalars().all()
    return {"replies": [r.to_dict() for r in replies]}


@router.post("/canned-replies", status_code=201)
async def create_canned_reply(
    req: CannedReplyIn,
    space=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    if not req.label.strip():
        raise HTTPException(400, "Label is required.")
    if not req.body.strip():
        raise HTTPException(400, "Body is required.")

    reply = CannedReply(
        space_id=space.id,
        label=req.label.strip(),
        body=req.body.strip(),
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return reply.to_dict()


@router.put("/canned-replies/{reply_id}")
async def update_canned_reply(
    reply_id: UUID,
    req: CannedReplyUpdate,
    space=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CannedReply).where(
            CannedReply.id == reply_id,
            CannedReply.space_id == space.id,
        )
    )
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(404, "Canned reply not found.")

    if req.label is not None:
        if not req.label.strip():
            raise HTTPException(400, "Label cannot be empty.")
        reply.label = req.label.strip()
    if req.body is not None:
        if not req.body.strip():
            raise HTTPException(400, "Body cannot be empty.")
        reply.body = req.body.strip()

    await db.commit()
    await db.refresh(reply)
    return reply.to_dict()


@router.delete("/canned-replies/{reply_id}", status_code=204)
async def delete_canned_reply(
    reply_id: UUID,
    space=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CannedReply).where(
            CannedReply.id == reply_id,
            CannedReply.space_id == space.id,
        )
    )
    reply = result.scalar_one_or_none()
    if not reply:
        raise HTTPException(404, "Canned reply not found.")

    await db.delete(reply)
    await db.commit()
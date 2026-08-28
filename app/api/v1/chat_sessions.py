"""
Chat Sessions API — JWT-protected endpoints for managing an org's chat sessions.

GET  /chat-sessions                  — list sessions (paginated, newest first)
GET  /chat-sessions/{session_id}     — get session + full message history
GET  /chat-sessions/{session_id}/history — message history only (uses Redis cache)
PATCH /chat-sessions/{session_id}    — update status (close / escalate)
DELETE /chat-sessions/{session_id}   — delete session + logs

Cache strategy:
  Active session history → Redis  key: chat:history:{session_id}  TTL: 2h
  On cache miss → load from ConversationLog, repopulate Redis
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
from app.core.redis import get_redis, RedisClient
from app.models.chat import ChatSession, MessageThought
from app.models.space import ConversationLog, Space

logger = structlog.get_logger()
router = APIRouter(prefix="/chat-sessions", tags=["Chat Sessions"])

# Redis TTL for active session history (2 hours)
HISTORY_TTL = 60 * 60 * 2


# ── Redis helpers ─────────────────────────────────────────────────────────────

def _history_key(session_id: str) -> str:
    return f"chat:history:{session_id}"


async def _get_history_from_cache(session_id: str, redis: RedisClient) -> list | None:
    return await redis.get(_history_key(session_id))


async def _set_history_cache(session_id: str, history: list, redis: RedisClient) -> None:
    await redis.set(_history_key(session_id), history, expire=HISTORY_TTL)


async def _invalidate_history_cache(session_id: str, redis: RedisClient) -> None:
    await redis.delete(_history_key(session_id))


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _load_history_from_db(session_id: str, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(ConversationLog)
        .where(ConversationLog.session_id == session_id)
        .order_by(ConversationLog.timestamp)
    )
    logs = result.scalars().all()

    # Reasoning/thoughts keyed by assistant message id (message_thoughts PK is
    # conversation_logs.id). Kept out of the admin-facing message text, like
    # the customer transcript.
    thoughts_by_msg = {}
    if logs:
        t_result = await db.execute(
            select(MessageThought).where(MessageThought.session_id == session_id)
        )
        for t in t_result.scalars().all():
            thoughts_by_msg[str(t.message_id)] = t.content

    return [
        {
            "id":         str(log.id),
            "role":       log.role,
            "message":    log.message,
            "agent_slug": log.agent_slug,
            "citations":  log.citations or [],
            "blocks":     log.blocks or [],
            "reasoning":  thoughts_by_msg.get(str(log.id)),
            "timestamp":  log.timestamp.isoformat() if log.timestamp else None,
            "created_at": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log in logs
    ]


async def _get_session(session_id: str, space_id: UUID,
                       db: AsyncSession) -> ChatSession:
    try:
        as_uuid = UUID(session_id)
    except ValueError:
        raise HTTPException(400, "Invalid session id.")
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == as_uuid,
            ChatSession.space_id == space_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    return session


# ── Schemas ───────────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id:              str
    session_id:      str
    title:           Optional[str]
    agent_slug:      Optional[str]
    status:          str
    message_count:   int
    started_at:      Optional[str]
    last_message_at: Optional[str]


class SessionUpdateRequest(BaseModel):
    status: str  # open | closed | escalated


# ── Public helper (called from customer.py after each message) ────────────────

async def upsert_session(
    db: AsyncSession,
    redis: RedisClient,
    space_id: UUID,
    session_id: str,
    user_message: str,
    agent_slug: str,
) -> None:
    """
    Create or update the ChatSession row and invalidate Redis history cache.
    Called after every chat turn in customer.py.
    """
    try:
        sess_uuid = UUID(session_id)
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == sess_uuid)
        )
        session = result.scalar_one_or_none()
    except (ValueError, TypeError):
        session = None

    if not session:
        title = user_message[:100].strip()
        session = ChatSession(
            id=UUID(session_id) if session_id else UUID(),
            space_id=space_id,
            title=title,
            agent_slug=agent_slug,
            status="open",
            message_count=2,
            last_message_at=datetime.utcnow(),
        )
        db.add(session)
    else:
        session.agent_slug      = agent_slug
        session.message_count   = (session.message_count or 0) + 2
        session.last_message_at = datetime.utcnow()

    await db.commit()

    # Invalidate Redis cache so subsequent reads load updated turns
    await _invalidate_history_cache(session_id, redis)



# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[SessionOut])
async def list_sessions(
    status: Optional[str] = Query(None, description="Filter by status"),
    chatbot_id: Optional[UUID] = Query(None, description="Scope to a specific chatbot; omitted = space-wide"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """List chat sessions for the authenticated org, newest first."""
    q = (
        select(ChatSession)
        .where(ChatSession.space_id == org.id)
        .order_by(desc(ChatSession.last_message_at))
        .limit(limit)
        .offset(offset)
    )
    if status:
        q = q.where(ChatSession.status == status)
    if chatbot_id:
        q = q.where(ChatSession.chatbot_id == chatbot_id)

    result = await db.execute(q)
    sessions = result.scalars().all()
    return [SessionOut(**s.to_dict()) for s in sessions]


@router.get("/{session_id}", response_model=dict)
async def get_session(
    session_id: str,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """Get session metadata + full message history."""
    session = await _get_session(session_id, org.id, db)

    # Try Redis first
    history = await _get_history_from_cache(session_id, redis)
    if history is None:
        history = await _load_history_from_db(session_id, db)
        await _set_history_cache(session_id, history, redis)

    return {**session.to_dict(), "history": history}


@router.get("/{session_id}/history")
async def get_session_history(
    session_id: str,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """Return only the message history for a session (Redis-cached)."""
    # Verify session belongs to org
    await _get_session(session_id, org.id, db)

    history = await _get_history_from_cache(session_id, redis)
    if history is None:
        history = await _load_history_from_db(session_id, db)
        await _set_history_cache(session_id, history, redis)

    return {"session_id": session_id, "history": history, "count": len(history)}


@router.patch("/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: str,
    req: SessionUpdateRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Update session status."""
    if req.status not in ("open", "closed", "escalated"):
        raise HTTPException(400, "status must be open, closed, or escalated.")

    session = await _get_session(session_id, org.id, db)
    session.status = req.status
    await db.commit()
    await db.refresh(session)

    # Evict from session agent pool when chatbox is closed
    if req.status in ("closed", "escalated"):
        from app.orchestra.ai.session.pool import pool as _session_pool
        _session_pool.destroy(session_id)

    return SessionOut(**session.to_dict())


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """Delete session and all its conversation logs."""
    session = await _get_session(session_id, org.id, db)

    # Delete logs first (no cascade on ConversationLog → ChatSession)
    await db.execute(
        delete(ConversationLog).where(ConversationLog.session_id == session_id)
    )
    await db.delete(session)
    await db.commit()
    await _invalidate_history_cache(session_id, redis)

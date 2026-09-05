"""
Inbox session endpoints for staff members.

GET  /inbox/sessions              — list escalated sessions
GET  /inbox/sessions/{id}         — session detail + full history
POST /inbox/sessions/{id}/claim   — staff claims a waiting session
POST /inbox/sessions/{id}/reply   — staff sends a message
POST /inbox/sessions/{id}/transfer — transfer to another staff
POST /inbox/sessions/{id}/resolve — close the session
"""

from __future__ import annotations

import structlog
from datetime import datetime
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Security

from app.core.database import get_db
from app.models.chat import ChatSession
from app.models.space import ConversationLog, Space
from app.models.staff import StaffMember
from app.api.v1.inbox.staff_auth import get_current_staff
from app.services.inbox import sse_manager
from app.services.inbox.transfer_service import transfer_to_staff, release_session

logger = structlog.get_logger()
router = APIRouter(prefix="/inbox/sessions", tags=["Inbox — Sessions"])

_bearer = HTTPBearer(auto_error=False)


class InboxIdentity:
    """Either a StaffMember or a Space owner acting as observer."""
    def __init__(self, staff: StaffMember | None, space: Space | None):
        self.staff = staff
        self.space = space

    @property
    def space_id(self):
        return self.staff.space_id if self.staff else self.space.id

    @property
    def staff_id(self):
        return self.staff.id if self.staff else None

    @property
    def is_owner(self):
        return self.space is not None


async def get_inbox_identity(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    db: AsyncSession = Depends(get_db),
) -> InboxIdentity:
    """Accept staff JWT or space-owner JWT."""
    from jose import jwt, JWTError
    from uuid import UUID as _UUID
    from app.config import settings

    if not credentials:
        raise HTTPException(401, "Authentication required.")

    token_str = credentials.credentials

    # Single secret for all tokens
    try:
        payload = jwt.decode(token_str, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token.")

    role = payload.get("role")

    if role == "staff":
        result = await db.execute(
            select(StaffMember).where(StaffMember.id == _UUID(payload["sub"]))
        )
        staff = result.scalar_one_or_none()
        if not staff or not staff.active:
            raise HTTPException(401, "Staff not found or inactive.")
        return InboxIdentity(staff=staff, space=None)

    # Space-owner JWT has no role field — identified by having a slug claim
    # or simply by finding a matching Space row
    if payload.get("slug") or not role:
        try:
            space_id = _UUID(payload["sub"])
        except Exception:
            raise HTTPException(401, "Invalid token.")
        result = await db.execute(select(Space).where(Space.id == space_id))
        space = result.scalar_one_or_none()
        if not space or not space.active:
            raise HTTPException(401, "Space not found.")
        return InboxIdentity(staff=None, space=space)

    raise HTTPException(403, "Token role not permitted.")


@router.get("")
async def list_sessions(
    chatbot_id: Optional[UUID] = Query(None, description="Scope to a specific chatbot; omitted = space-wide"),
    identity: InboxIdentity = Depends(get_inbox_identity),
    db: AsyncSession = Depends(get_db),
):
    q = select(ChatSession).where(ChatSession.space_id == identity.space_id)
    if chatbot_id:
        q = q.where(ChatSession.chatbot_id == chatbot_id)

    if identity.is_owner:
        # Space owner sees all sessions
        q = q.order_by(ChatSession.last_message_at.desc())
    else:
        # Staff only sees inbox-relevant sessions
        q = q.where(
            ChatSession.status.in_(["escalated", "queued", "active"])
        ).order_by(ChatSession.escalated_at.desc())

    sessions = (await db.execute(q)).scalars().all()
    return [_session_out(s) for s in sessions]


@router.get("/{session_id}")
async def get_session(
    session_id: UUID,
    identity: InboxIdentity = Depends(get_inbox_identity),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_for_staff(db, session_id, identity.space_id)
    history = await _load_history(db, session_id)
    return {**_session_out(session), "history": history}


@router.post("/{session_id}/claim")
async def claim_session(
    session_id: UUID,
    identity: InboxIdentity = Depends(get_inbox_identity),
    db: AsyncSession = Depends(get_db),
):
    """Staff or Space Owner manually claims a waiting/queued session."""
    session = await _get_session_for_staff(db, session_id, identity.space_id)
    if identity.is_owner:
        session.status = "active"
        session.assigned_staff_id = None
        await db.commit()
        await sse_manager.broadcast_to_space_staff(str(identity.space_id), "queue_updated", {
            "action": "claimed", "session_id": str(session_id)
        })
        return {"result": "claimed_by_owner"}

    staff = identity.staff
    if session.status == "active" and session.assigned_staff_id != staff.id:
        raise HTTPException(409, "Session is already claimed by another staff member.")

    result = await transfer_to_staff(
        db=db,
        session_id=session_id,
        source="manual",
        target_staff_id=staff.id,
    )
    return {"result": result}


class ReplyRequest(BaseModel):
    content: str


@router.post("/{session_id}/reply")
async def reply_to_session(
    session_id: UUID,
    req: ReplyRequest,
    identity: InboxIdentity = Depends(get_inbox_identity),
    db: AsyncSession = Depends(get_db),
):
    """Staff or Space Owner sends a message into the session."""
    session = await _get_session_for_staff(db, session_id, identity.space_id)
    if identity.is_owner:
        sender_name = identity.space.display_name or "Support"
    else:
        staff = identity.staff
        if session.assigned_staff_id != staff.id:
            raise HTTPException(403, "You are not assigned to this session.")
        sender_name = staff.name

    log = ConversationLog(
        space_id=session.space_id,
        chatbot_id=session.chatbot_id,
        session_id=str(session_id),
        role="human_agent",
        message=req.content,
        agent_slug="human",
        timestamp=datetime.utcnow(),
    )
    db.add(log)
    session.last_message_at = datetime.utcnow()
    session.message_count = (session.message_count or 0) + 1
    await db.commit()

    # Invalidate Redis cache so customer sees fresh history on restore
    try:
        from app.core.redis import redis_client as _rc
        from app.api.v1.chat_sessions import _history_key
        await _rc.delete(_history_key(str(session_id)))
    except Exception:
        pass

    await sse_manager.send_human_message(
        session_id=str(session_id),
        content=req.content,
        staff_name=sender_name,
        timestamp=log.timestamp.isoformat(),
    )

    return {"ok": True, "timestamp": log.timestamp.isoformat()}


class TransferRequest(BaseModel):
    target_staff_id: UUID
    reason: Optional[str] = None


@router.post("/{session_id}/transfer")
async def transfer_session(
    session_id: UUID,
    req: TransferRequest,
    identity: InboxIdentity = Depends(get_inbox_identity),
    db: AsyncSession = Depends(get_db),
):
    """Transfer session to another staff member."""
    session = await _get_session_for_staff(db, session_id, identity.space_id)
    if not identity.is_owner:
        staff = identity.staff
        if session.assigned_staff_id != staff.id:
            raise HTTPException(403, "You are not assigned to this session.")

    target_result = await db.execute(
        select(StaffMember).where(
            StaffMember.id == req.target_staff_id,
            StaffMember.space_id == identity.space_id,
            StaffMember.active == True,
        )
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Target staff member not found.")
    if target.service_paused:
        raise HTTPException(409, "Target staff member has paused new chats.")

    if session.assigned_staff_id:
        await release_session(db, session_id, session.assigned_staff_id, reason="transferred")

    await sse_manager.send_session_transferred(
        session_id=str(session_id),
        space_id=str(identity.space_id),
        from_staff_id=str(session.assigned_staff_id) if session.assigned_staff_id else "owner",
        from_staff_name=identity.space.display_name if identity.is_owner else identity.staff.name,
        to_staff_id=str(target.id),
        to_staff_name=target.name,
    )

    result = await transfer_to_staff(
        db=db,
        session_id=session_id,
        source="transfer",
        target_staff_id=req.target_staff_id,
    )
    return {"result": result}

    target_result = await db.execute(
        select(StaffMember).where(
            StaffMember.id == req.target_staff_id,
            StaffMember.space_id == staff.space_id,
            StaffMember.active == True,
        )
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Target staff member not found.")
    if target.service_paused:
        raise HTTPException(409, "Target staff member has paused new chats.")

    await release_session(db, session_id, staff.id, reason="transferred")

    await sse_manager.send_session_transferred(
        session_id=str(session_id),
        space_id=str(staff.space_id),
        from_staff_id=str(staff.id),
        from_staff_name=staff.name,
        to_staff_id=str(target.id),
        to_staff_name=target.name,
    )

    result = await transfer_to_staff(
        db=db,
        session_id=session_id,
        source="transfer",
        target_staff_id=req.target_staff_id,
    )
    return {"result": result}


@router.post("/{session_id}/resolve")
async def resolve_session(
    session_id: UUID,
    identity: InboxIdentity = Depends(get_inbox_identity),
    db: AsyncSession = Depends(get_db),
):
    """Close the session — staff or space owner can resolve."""
    session = await _get_session_for_staff(db, session_id, identity.space_id)
    if not identity.is_owner and session.assigned_staff_id != identity.staff_id:
        raise HTTPException(403, "You are not assigned to this session.")

    session.status = "closed"
    session.resolved_at = datetime.utcnow()
    if identity.staff_id:
        await release_session(db, session_id, identity.staff_id, reason="resolved")

    await sse_manager.push_to_customer(str(session_id), "session_closed", {
        "message": "The support session has been closed. Thank you for contacting us."
    })
    await sse_manager.broadcast_to_space_staff(str(identity.space_id), "queue_updated", {
        "action": "resolved", "session_id": str(session_id)
    })

    from app.services.inbox.queue_service import trigger_queue_for_space
    await trigger_queue_for_space(db, identity.space_id)

    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_session_for_staff(
    db: AsyncSession, session_id: UUID, space_id: UUID
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.space_id == space_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found.")
    return session


async def _load_history(db: AsyncSession, session_id: UUID) -> list[dict]:
    result = await db.execute(
        select(ConversationLog)
        .where(ConversationLog.session_id == str(session_id))
        .order_by(ConversationLog.timestamp.asc())
    )
    return [
        {
            "role":      l.role,
            "message":   l.message,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
        }
        for l in result.scalars().all()
    ]


def _session_out(s: ChatSession) -> dict:
    return {
        "id":                 str(s.id),
        "title":              s.title,
        "status":             s.status,
        "assigned_staff_id":  str(s.assigned_staff_id) if s.assigned_staff_id else None,
        "escalated_at":       s.escalated_at.isoformat() if s.escalated_at else None,
        "escalation_reason":  s.escalation_reason,
        "escalation_brief":   s.escalation_brief,
        "message_count":      s.message_count,
        "last_message_at":    s.last_message_at.isoformat() if s.last_message_at else None,
    }

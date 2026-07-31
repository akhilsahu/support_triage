"""
SSE stream endpoints.

GET /inbox/stream           — staff members connect here (persistent)
GET /inbox/customer-stream  — customer connects here (persistent)

Each connection holds an asyncio.Queue. The server pushes events
into the queue; this endpoint drains it and streams to the client.
"""

from __future__ import annotations

import asyncio
import json
import structlog
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.database import AsyncSessionLocal, get_db
from app.models.staff import StaffMember
from app.api.v1.inbox.staff_auth import get_current_staff
from app.services.inbox import sse_manager


def _extract_bearer(request: Request) -> str:
    """
    Extract JWT from Authorization: Bearer header.
    Raises 401 if missing or malformed.
    Never reads from query params — tokens in URLs end up in logs.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Authorization: Bearer <token> header required.")
    return auth[7:]


async def _resolve_token(token: str, db: AsyncSession):
    """
    Decode + validate a JWT.
    Returns (subject_id, space_id, role) for both staff and space-owner tokens.
    """
    from jose import jwt, JWTError
    from uuid import UUID
    from app.config import settings
    from sqlalchemy import select
    from app.models.space import Space

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token.")

    role = payload.get("role")

    if role == "staff":
        result = await db.execute(select(StaffMember).where(StaffMember.id == UUID(payload["sub"])))
        staff = result.scalar_one_or_none()
        if not staff or not staff.active:
            raise HTTPException(401, "Staff not found or inactive.")
        return str(staff.id), str(staff.space_id), "staff"

    # Space-owner token (has slug claim, no role field)
    result = await db.execute(select(Space).where(Space.id == UUID(payload["sub"])))
    space = result.scalar_one_or_none()
    if not space or not space.active:
        raise HTTPException(401, "Space not found.")
    return str(space.id), str(space.id), "owner"

logger = structlog.get_logger()
router = APIRouter(prefix="/inbox", tags=["Inbox — SSE"])

HEARTBEAT_INTERVAL = 25   # seconds between SSE keep-alive pings


# ── Staff stream ──────────────────────────────────────────────────────────────

@router.get("/stream")
async def staff_stream(
    request: Request,
):
    """
    Persistent SSE connection for staff members and space owners.
    Auth: Authorization: Bearer <token> header (never a URL query param).
    Events pushed: new_session, session_transferred, queue_updated.
    """
    token = _extract_bearer(request)
    async with AsyncSessionLocal() as db:
        subject_id, space_id, role = await _resolve_token(token, db)
    # For staff use their id; for owner use space_id as the SSE key
    staff_id = subject_id if role == "staff" else f"owner_{space_id}"

    async def event_generator():
        queue = sse_manager.register_staff(staff_id, space_id)
        logger.info("sse.staff_stream_opened", staff_id=staff_id)
        try:
            while True:
                # Send heartbeat or wait for an event
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                    yield {"event": event["event"], "data": event["data"]}
                except asyncio.TimeoutError:
                    # Keep-alive ping
                    yield {"event": "ping", "data": "{}"}
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.unregister_staff(staff_id)
            # Only mark offline and reassign for actual staff (not owners)
            if role != "staff":
                logger.info("sse.owner_stream_closed", space_id=space_id)
                return

            from datetime import datetime
            from sqlalchemy import select
            from uuid import UUID
            from app.models.chat import ChatSession
            from app.services.inbox.transfer_service import release_session, transfer_to_staff
            from app.core.database import AsyncSessionLocal

            async with AsyncSessionLocal() as close_db:
                staff_row = (await close_db.execute(
                    select(StaffMember).where(StaffMember.id == UUID(subject_id))
                )).scalar_one_or_none()

                if staff_row:
                    staff_row.presence = "offline"
                    await close_db.commit()

                    active = (await close_db.execute(
                        select(ChatSession).where(
                            ChatSession.assigned_staff_id == UUID(subject_id),
                            ChatSession.status == "active",
                        )
                    )).scalars().all()

                    for session in active:
                        await release_session(close_db, session.id, UUID(subject_id), reason="staff_offline")
                        await transfer_to_staff(
                            close_db, session.id, source="rule", exclude_staff_id=UUID(subject_id)
                        )

            logger.info("sse.staff_stream_closed", staff_id=staff_id)

    return EventSourceResponse(event_generator())


# ── Customer stream ───────────────────────────────────────────────────────────

@router.get("/customer-stream")
async def customer_stream(
    session_id: UUID = Query(..., description="Chat session ID"),
):
    """
    Persistent SSE connection for a customer waiting for/chatting with a human.
    Events pushed:
      - staff_assigned       when a staff member joins
      - session_transferred  when session is handed to another staff
      - human_message        when staff sends a reply
      - queue_position_update current queue position
      - queue_expired        when wait time exceeded
      - session_closed       when staff resolves the session
    """
    sid = str(session_id)

    async def event_generator():
        queue = sse_manager.register_customer(sid)
        logger.info("sse.customer_stream_opened", session_id=sid)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                    yield {"event": event["event"], "data": event["data"]}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.unregister_customer(sid)
            logger.info("sse.customer_stream_closed", session_id=sid)

    return EventSourceResponse(event_generator())

"""
Core transfer service — transfer_to_staff().

This is the single entry point for all transfer paths:
  - AI escalation (source="ai_escalation")
  - Manual claim   (source="manual", target_staff_id set)
  - Staff transfer (source="transfer", target_staff_id set)
  - Auto-route     (source="rule")

Returns one of:
  "assigned"   — successfully assigned to a staff member
  "queued"     — no staff available, added to waiting queue
  "no_action"  — session already active/queued, nothing to do
"""

from __future__ import annotations

import structlog
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatSession
from app.models.staff import StaffMember
from app.models.inbox import (
    SessionWaitingQueue,
    SessionAssignmentHistory,
    SpaceAssignmentRule,
)
from app.services.inbox import staff_selection, sse_manager

logger = structlog.get_logger()


# ── Assignment rule helper ────────────────────────────────────────────────────

async def get_or_create_rule(db: AsyncSession, space_id: UUID) -> SpaceAssignmentRule:
    result = await db.execute(
        select(SpaceAssignmentRule).where(SpaceAssignmentRule.space_id == space_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        rule = SpaceAssignmentRule(space_id=space_id)
        db.add(rule)
        await db.commit()
        await db.refresh(rule)
    return rule


# ── Core function ─────────────────────────────────────────────────────────────

async def transfer_to_staff(
    db: AsyncSession,
    session_id: UUID,
    source: str,                        # rule | ai_escalation | manual | transfer
    target_staff_id: UUID | None = None,
    escalation_reason: str | None = None,
    last_customer_message: str = "",
    exclude_staff_id: UUID | None = None,
) -> str:
    """
    Attempt to assign an available staff member to the given session.

    Steps:
    1. Lock session row (prevent race conditions)
    2. Validate state transition
    3. Set ai_disabled if AI escalation
    4. Get available candidates
    5. Select staff (direct → history → LLM → load balance)
    6. Assign or queue
    7. Emit SSE events
    """

    # 1. Lock session row
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.id == session_id)
        .with_for_update()
    )
    session = result.scalar_one_or_none()
    if not session:
        logger.warning("transfer.session_not_found", session_id=str(session_id))
        return "no_action"

    # 2. Validate state — don't re-queue already active/queued sessions
    if session.status in ("active", "queued"):
        logger.info("transfer.already_assigned", session_id=str(session_id), status=session.status)
        return "no_action"

    # 3. Mark escalation — disable AI for ALL transfer sources
    session.ai_disabled = True
    session.escalated_at = datetime.utcnow()
    session.escalation_reason = escalation_reason or source
    session.status = "escalated"

    space_id = session.space_id
    rule = await get_or_create_rule(db, space_id)

    # 4. Get available candidates
    candidates = await staff_selection.get_available_candidates(
        db, space_id, exclude_staff_id=exclude_staff_id
    )

    # Find prior session IDs for history priority lookup
    prior_sessions_result = await db.execute(
        select(ChatSession.id).where(
            ChatSession.space_id == space_id,
            ChatSession.id != session_id,
        ).limit(20)
    )
    prior_session_ids = [r[0] for r in prior_sessions_result.all()]

    # 5. Select staff
    selected = await staff_selection.select_staff(
        db=db,
        candidates=candidates,
        history_priority_enabled=rule.history_priority_enabled,
        llm_assignment_enabled=rule.llm_assignment_enabled,
        customer_session_ids=prior_session_ids,
        last_customer_message=last_customer_message,
        target_staff_id=target_staff_id,
    )

    # 6a. No staff — add to queue
    if not selected:
        await _add_to_queue(db, session, space_id, rule)
        await db.commit()

        position = await _get_queue_position(db, session_id)
        await sse_manager.send_queue_position(str(session_id), position)
        await sse_manager.broadcast_to_space_staff(str(space_id), "queue_updated", {
            "action": "new_entry",
            "session_id": str(session_id),
        })

        # Send email notification
        from app.services.inbox.email_notify import send_escalation_email
        await send_escalation_email(session, rule)

        logger.info("transfer.queued", session_id=str(session_id), space_id=str(space_id))
        return "queued"

    # 6b. Assign to selected staff
    await _do_assign(db, session, selected, space_id, source)
    await db.commit()

    # 7. SSE events
    history = await _load_session_history(db, session_id)
    await sse_manager.send_staff_assigned(
        session_id=str(session_id),
        space_id=str(space_id),
        staff_id=str(selected.id),
        staff_name=selected.name,
        customer_info={"session_id": str(session_id), "title": session.title or ""},
        history=history,
    )

    logger.info("transfer.assigned", session_id=str(session_id), staff_id=str(selected.id), source=source)
    return "assigned"


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _do_assign(
    db: AsyncSession,
    session: ChatSession,
    staff: StaffMember,
    space_id: UUID,
    source: str,
) -> None:
    """Update session + staff counters + write assignment history."""
    session.status = "active"
    session.assigned_staff_id = staff.id
    session.claimed_at = datetime.utcnow()
    if not session.escalated_at:
        session.escalated_at = datetime.utcnow()

    staff.active_chat_count = (staff.active_chat_count or 0) + 1

    db.add(SessionAssignmentHistory(
        session_id=session.id,
        staff_id=staff.id,
        source=source,
        assigned_at=datetime.utcnow(),
    ))

    # Mark waiting queue entry as assigned if present
    q_result = await db.execute(
        select(SessionWaitingQueue).where(
            SessionWaitingQueue.session_id == session.id,
            SessionWaitingQueue.status == "waiting",
        )
    )
    q_entry = q_result.scalar_one_or_none()
    if q_entry:
        q_entry.status = "assigned"
        q_entry.assigned_at = datetime.utcnow()


async def _add_to_queue(
    db: AsyncSession,
    session: ChatSession,
    space_id: UUID,
    rule: SpaceAssignmentRule,
) -> None:
    """Place a session in the waiting queue if not already there."""
    existing = await db.execute(
        select(SessionWaitingQueue).where(
            SessionWaitingQueue.session_id == session.id
        )
    )
    if existing.scalar_one_or_none():
        return  # already queued

    max_pos_result = await db.execute(
        select(func.max(SessionWaitingQueue.position)).where(
            SessionWaitingQueue.space_id == space_id,
            SessionWaitingQueue.status == "waiting",
        )
    )
    max_pos = max_pos_result.scalar() or 0

    db.add(SessionWaitingQueue(
        space_id=space_id,
        session_id=session.id,
        position=max_pos + 1,
        priority=0,
        status="waiting",
        expires_at=datetime.utcnow() + timedelta(minutes=rule.queue_wait_timeout_minutes),
    ))
    session.status = "queued"


async def _get_queue_position(db: AsyncSession, session_id: UUID) -> int:
    """Dynamic position: count entries ahead by priority then insertion order."""
    entry_result = await db.execute(
        select(SessionWaitingQueue).where(
            SessionWaitingQueue.session_id == session_id,
            SessionWaitingQueue.status == "waiting",
        )
    )
    entry = entry_result.scalar_one_or_none()
    if not entry:
        return 0

    ahead_result = await db.execute(
        select(func.count()).where(
            SessionWaitingQueue.space_id == entry.space_id,
            SessionWaitingQueue.status == "waiting",
            (
                (SessionWaitingQueue.priority > entry.priority) |
                (
                    (SessionWaitingQueue.priority == entry.priority) &
                    (SessionWaitingQueue.position < entry.position)
                )
            )
        )
    )
    return (ahead_result.scalar() or 0) + 1


async def _load_session_history(db: AsyncSession, session_id: UUID) -> list[dict]:
    """Load last 20 messages for the session to send to the staff member."""
    from app.models.space import ConversationLog
    result = await db.execute(
        select(ConversationLog)
        .where(ConversationLog.session_id == str(session_id))
        .order_by(ConversationLog.timestamp.desc())
        .limit(20)
    )
    logs = result.scalars().all()
    return [
        {"role": l.role, "message": l.message, "timestamp": l.timestamp.isoformat()}
        for l in reversed(logs)
    ]


# ── Release a session (staff done or went offline) ────────────────────────────

async def release_session(
    db: AsyncSession,
    session_id: UUID,
    staff_id: UUID,
    reason: str = "resolved",
) -> None:
    """Decrement staff chat count and close assignment history entry."""
    staff_result = await db.execute(
        select(StaffMember).where(StaffMember.id == staff_id)
    )
    staff = staff_result.scalar_one_or_none()
    if staff and staff.active_chat_count > 0:
        staff.active_chat_count -= 1

    history_result = await db.execute(
        select(SessionAssignmentHistory).where(
            SessionAssignmentHistory.session_id == session_id,
            SessionAssignmentHistory.staff_id == staff_id,
            SessionAssignmentHistory.released_at == None,
        )
    )
    history = history_result.scalar_one_or_none()
    if history:
        history.released_at = datetime.utcnow()
        history.release_reason = reason

    await db.commit()

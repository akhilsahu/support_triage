"""
Queue management.

trigger_queue_for_space() — called when a staff member becomes available.
process_waiting_queue()   — background fallback, runs every 2 minutes.
cleanup_expired_entries() — expires timed-out queue entries.
"""

from __future__ import annotations

import structlog
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inbox import SessionWaitingQueue, SpaceAssignmentRule
from app.services.inbox import sse_manager

logger = structlog.get_logger()


async def trigger_queue_for_space(db: AsyncSession, space_id: UUID) -> None:
    """
    Try to assign waiting sessions for a space.
    Called when a staff member comes online, unpauses, or closes a session.
    Processes in priority → position order.
    """
    from app.services.inbox.transfer_service import transfer_to_staff

    waiting = (await db.execute(
        select(SessionWaitingQueue).where(
            SessionWaitingQueue.space_id == space_id,
            SessionWaitingQueue.status == "waiting",
        ).order_by(
            SessionWaitingQueue.priority.desc(),
            SessionWaitingQueue.position.asc(),
        )
    )).scalars().all()

    for entry in waiting:
        result = await transfer_to_staff(
            db=db,
            session_id=entry.session_id,
            source="rule",
        )
        if result == "queued":
            # No staff available — stop trying for this space
            break
        logger.info("queue.drained_entry", session_id=str(entry.session_id), result=result)


async def process_waiting_queue(db: AsyncSession) -> None:
    """
    Fallback background sweep — processes all spaces with waiting entries.
    Catches anything missed by event-driven triggers.
    """
    spaces_result = await db.execute(
        select(SessionWaitingQueue.space_id)
        .where(SessionWaitingQueue.status == "waiting")
        .distinct()
    )
    space_ids = [r[0] for r in spaces_result.all()]

    for space_id in space_ids:
        try:
            await trigger_queue_for_space(db, space_id)
        except Exception as e:
            logger.error("queue.process_failed", space_id=str(space_id), error=str(e))


async def cleanup_expired_entries(db: AsyncSession) -> None:
    """
    Mark waiting entries as expired if they've been waiting too long.
    Notifies the customer and resets session status.
    """
    from app.models.chat import ChatSession

    now = datetime.utcnow()
    expired = (await db.execute(
        select(SessionWaitingQueue).where(
            SessionWaitingQueue.status == "waiting",
            SessionWaitingQueue.expires_at < now,
        )
    )).scalars().all()

    for entry in expired:
        entry.status = "expired"

        session_result = await db.execute(
            select(ChatSession).where(ChatSession.id == entry.session_id)
        )
        session = session_result.scalar_one_or_none()
        if session:
            session.status = "closed"

            # Get no_staff_message from rule
            rule_result = await db.execute(
                select(SpaceAssignmentRule).where(
                    SpaceAssignmentRule.space_id == session.space_id
                )
            )
            rule = rule_result.scalar_one_or_none()
            message = rule.no_staff_message if rule else "Our team is currently unavailable."
            await sse_manager.send_queue_expired(str(entry.session_id), message)

        logger.info("queue.entry_expired", session_id=str(entry.session_id))

    if expired:
        await db.commit()

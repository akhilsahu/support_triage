"""
Background tasks for the inbox system.

- process_waiting_queue  — drain queue every 2 min (fallback)
- cleanup_expired_entries — expire timed-out queue entries
- heartbeat_checker       — mark staff offline after 90s no-ping
"""

from __future__ import annotations

import asyncio
import structlog
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.database import AsyncSessionLocal

logger = structlog.get_logger()

HEARTBEAT_TIMEOUT_SECONDS = 90
POLL_INTERVAL_SECONDS = 120


async def process_waiting_queue():
    """Periodically drain waiting queues for all spaces."""
    from app.services.inbox.queue_service import process_waiting_queue as _drain
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            async with AsyncSessionLocal() as db:
                await _drain(db)
        except Exception:
            logger.exception("inbox_tasks.process_waiting_queue.error")


async def cleanup_expired_entries():
    """Periodically expire queue entries that have waited too long."""
    from app.services.inbox.queue_service import cleanup_expired_entries as _cleanup
    while True:
        await asyncio.sleep(60)
        try:
            async with AsyncSessionLocal() as db:
                await _cleanup(db)
        except Exception:
            logger.exception("inbox_tasks.cleanup_expired_entries.error")


async def heartbeat_checker():
    """Mark staff offline if last_seen_at > 90s ago, then reassign their sessions."""
    from app.models.staff import StaffMember
    from app.models.chat import ChatSession
    from app.services.inbox.transfer_service import release_session, transfer_to_staff
    from app.services.inbox import sse_manager

    while True:
        await asyncio.sleep(30)
        try:
            cutoff = datetime.utcnow() - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
            async with AsyncSessionLocal() as db:
                stale = (await db.execute(
                    select(StaffMember).where(
                        StaffMember.presence == "online",
                        StaffMember.last_seen_at < cutoff,
                    )
                )).scalars().all()

                for staff in stale:
                    logger.info("inbox_tasks.staff_timeout", staff_id=str(staff.id))
                    staff.presence = "offline"
                    sse_manager.unregister_staff(str(staff.id))

                    # Reassign active sessions
                    active = (await db.execute(
                        select(ChatSession).where(
                            ChatSession.assigned_staff_id == staff.id,
                            ChatSession.status == "active",
                        )
                    )).scalars().all()

                    for session in active:
                        await release_session(db, session.id, staff.id, reason="staff_timeout")
                        await transfer_to_staff(
                            db, session.id, source="rule", exclude_staff_id=staff.id
                        )

                await db.commit()
        except Exception:
            logger.exception("inbox_tasks.heartbeat_checker.error")


def start_inbox_tasks():
    """Schedule all inbox background tasks. Call from lifespan."""
    asyncio.create_task(process_waiting_queue())
    asyncio.create_task(cleanup_expired_entries())
    asyncio.create_task(heartbeat_checker())
    logger.info("inbox_tasks.started")

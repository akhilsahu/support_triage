"""
DB ops for loading org and chatbot records.

Workflows and executors call these instead of querying SQLAlchemy directly.
"""

from __future__ import annotations
from typing import Optional, Tuple
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.chatbot import Chatbot

logger = structlog.get_logger()


async def load_org_by_slug(
    db: AsyncSession,
    slug: str,
) -> Optional[Space]:
    """Load active org by slug."""
    result = await db.execute(
        select(Space).where(
            Space.slug   == slug,
            Space.active == True,
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        logger.warning("db_utils.org_not_found", slug=slug)
    return org


async def load_org_by_id(
    db: AsyncSession,
    space_id: UUID,
) -> Optional[Space]:
    """Load org by UUID."""
    result = await db.execute(
        select(Space).where(Space.id == space_id)
    )
    return result.scalar_one_or_none()


async def load_default_chatbot(
    db: AsyncSession,
    space_id: UUID,
) -> Optional[Chatbot]:
    """Load the default active chatbot for an org."""
    result = await db.execute(
        select(Chatbot).where(
            Chatbot.space_id     == space_id,
            Chatbot.is_default == True,
            Chatbot.active     == True,
        )
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        logger.warning("db_utils.default_chatbot_not_found", space_id=str(space_id))
    return chatbot


async def load_org_and_chatbot(
    db: AsyncSession,
    slug: str,
) -> Tuple[Optional[Space], Optional[Chatbot]]:
    """
    Convenience: load org + default chatbot in one call.
    Used by workflows and executors as the standard entry point.
    """
    org = await load_org_by_slug(db, slug)
    if not org:
        return None, None
    chatbot = await load_default_chatbot(db, org.id)
    return org, chatbot


async def load_all_org_chatbots(
    db: AsyncSession,
    space_id: UUID,
) -> list[Chatbot]:
    """Load all active chatbots for an org (used in onboarding workflows)."""
    result = await db.execute(
        select(Chatbot).where(
            Chatbot.space_id == space_id,
            Chatbot.active == True,
        )
    )
    return result.scalars().all()

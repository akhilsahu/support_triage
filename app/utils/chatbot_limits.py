"""
Chatbot-limit resolution.

Effective limit for a space = Space.max_chatbots if set, else the global
PlatformSettings.default_max_chatbots. Sentinel: -1 = unlimited, 1 = single bot.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chatbot import Chatbot
from app.models.space import PlatformSettings, Space

UNLIMITED = -1
DEFAULT_LIMIT = 1


async def get_platform_default(db: AsyncSession) -> int:
    """Global default cap; 1 if the singleton row doesn't exist yet."""
    row = (await db.execute(select(PlatformSettings).limit(1))).scalar_one_or_none()
    if row is None or row.default_max_chatbots is None:
        return DEFAULT_LIMIT
    return row.default_max_chatbots


async def effective_limit(db: AsyncSession, space: Space) -> int:
    """Per-space override wins; otherwise the platform default."""
    if space.max_chatbots is not None:
        return space.max_chatbots
    return await get_platform_default(db)


async def chatbot_quota(db: AsyncSession, space: Space) -> dict:
    """{count, limit, unlimited, can_create} for gating create + UI layout."""
    limit = await effective_limit(db, space)
    count = await db.scalar(
        select(func.count()).select_from(Chatbot).where(Chatbot.space_id == space.id)
    ) or 0
    unlimited = limit == UNLIMITED
    return {
        "count": count,
        "limit": limit,
        "unlimited": unlimited,
        "can_create": unlimited or count < limit,
    }

"""
Shared async DB query helpers.

All functions take an AsyncSession and return ORM objects or scalars.
They never raise HTTP errors — callers do that.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional, List

from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import (
    Space, PromptSkill, ConversationLog,
    SpaceBuiltinAgentConfig, CustomAgent, BuiltinAgentCatalog,
)


# ── Space ──────────────────────────────────────────────────────────────

async def get_org_by_id(db: AsyncSession, space_id: uuid.UUID) -> Optional[Space]:
    result = await db.execute(select(Space).where(Space.id == space_id))
    return result.scalar_one_or_none()


async def get_org_by_slug(db: AsyncSession, slug: str) -> Optional[Space]:
    result = await db.execute(select(Space).where(Space.slug == slug))
    return result.scalar_one_or_none()


async def list_orgs(
    db: AsyncSession,
    search: Optional[str] = None,
    plan: Optional[str] = None,
    active: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[Space], int]:
    q = select(Space).order_by(desc(Space.created_at))
    if search:
        q = q.where(
            Space.slug.ilike(f"%{search}%") |
            Space.display_name.ilike(f"%{search}%")
        )
    if plan:
        q = q.where(Space.plan == plan)
    if active is not None:
        q = q.where(Space.active == active)
    rows = (await db.execute(q.offset(offset).limit(limit))).scalars().all()
    total = (await db.execute(select(func.count()).select_from(Space))).scalar()
    return rows, total


async def set_org_active(db: AsyncSession, org: Space, active: bool) -> Space:
    org.active = active
    await db.commit()
    await db.refresh(org)
    return org


async def set_org_plan(db: AsyncSession, org: Space, plan: str) -> Space:
    org.plan = plan
    await db.commit()
    await db.refresh(org)
    return org


# ── CustomAgent ───────────────────────────────────────────────────────────────

async def get_agent(db: AsyncSession, space_id: uuid.UUID, slug: str) -> Optional[CustomAgent]:
    result = await db.execute(
        select(CustomAgent).where(
            CustomAgent.space_id == space_id,
            CustomAgent.slug == slug,
        )
    )
    return result.scalar_one_or_none()


async def list_agents(
    db: AsyncSession,
    space_id: Optional[uuid.UUID] = None,
    active: Optional[bool] = None,
) -> List[CustomAgent]:
    q = select(CustomAgent)
    if space_id is not None:
        q = q.where(CustomAgent.space_id == space_id)
    if active is not None:
        q = q.where(CustomAgent.active == active)
    return (await db.execute(q)).scalars().all()


async def count_agents(db: AsyncSession, space_id: uuid.UUID, active_only: bool = False) -> int:
    q = select(func.count()).select_from(CustomAgent).where(CustomAgent.space_id == space_id)
    if active_only:
        q = q.where(CustomAgent.active == True)
    return (await db.execute(q)).scalar()


# ── PromptSkill ───────────────────────────────────────────────────────────────

async def get_skill(db: AsyncSession, skill_id: uuid.UUID, space_id: uuid.UUID) -> Optional[PromptSkill]:
    result = await db.execute(
        select(PromptSkill).where(
            PromptSkill.id == skill_id,
            PromptSkill.space_id == space_id,
        )
    )
    return result.scalar_one_or_none()


async def list_skills(db: AsyncSession, space_id: uuid.UUID) -> List[PromptSkill]:
    result = await db.execute(select(PromptSkill).where(PromptSkill.space_id == space_id))
    return result.scalars().all()


async def count_skills(db: AsyncSession, space_id: uuid.UUID) -> int:
    return (await db.execute(
        select(func.count()).select_from(PromptSkill).where(PromptSkill.space_id == space_id)
    )).scalar()


# ── ConversationLog ───────────────────────────────────────────────────────────

async def count_messages(db: AsyncSession, space_id: Optional[uuid.UUID] = None) -> int:
    q = select(func.count()).select_from(ConversationLog)
    if space_id:
        q = q.where(ConversationLog.space_id == space_id)
    return (await db.execute(q)).scalar()


async def count_messages_since(db: AsyncSession, since: datetime, space_id: Optional[uuid.UUID] = None) -> int:
    q = select(func.count()).select_from(ConversationLog).where(ConversationLog.timestamp >= since)
    if space_id:
        q = q.where(ConversationLog.space_id == space_id)
    return (await db.execute(q)).scalar()


async def list_logs(
    db: AsyncSession,
    space_id: Optional[uuid.UUID] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[tuple]:
    """Returns list of (ConversationLog, org_slug, org_display_name)."""
    q = (
        select(ConversationLog, Space.slug, Space.display_name)
        .join(Space, ConversationLog.space_id == Space.id)
        .order_by(desc(ConversationLog.timestamp))
    )
    if space_id:
        q = q.where(ConversationLog.space_id == space_id)
    return (await db.execute(q.offset(offset).limit(limit))).all()


async def analytics_for_org(db: AsyncSession, space_id: uuid.UUID, days: int) -> dict:
    since = datetime.utcnow() - timedelta(days=days)

    total = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.space_id == space_id,
            ConversationLog.role == "user",
            ConversationLog.timestamp >= since,
        )
    )).scalar() or 0

    rag_hits = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.space_id == space_id,
            ConversationLog.rag_hit == True,
            ConversationLog.timestamp >= since,
        )
    )).scalar() or 0

    avg_ms = (await db.execute(
        select(func.avg(ConversationLog.response_ms)).where(
            ConversationLog.space_id == space_id,
            ConversationLog.timestamp >= since,
        )
    )).scalar()

    intent_rows = (await db.execute(
        select(ConversationLog.intent, func.count().label("cnt")).where(
            ConversationLog.space_id == space_id,
            ConversationLog.role == "user",
            ConversationLog.timestamp >= since,
        ).group_by(ConversationLog.intent)
    )).all()

    agent_rows = (await db.execute(
        select(ConversationLog.agent_slug, func.count().label("cnt")).where(
            ConversationLog.space_id == space_id,
            ConversationLog.timestamp >= since,
        ).group_by(ConversationLog.agent_slug)
    )).all()

    return {
        "period_days": days,
        "total_messages": total,
        "rag_hits": rag_hits,
        "avg_response_ms": round(avg_ms) if avg_ms else None,
        "intent_distribution": {r.intent or "unknown": r.cnt for r in intent_rows},
        "agent_distribution": {r.agent_slug or "unknown": r.cnt for r in agent_rows},
    }


# ── Platform-wide counts (super admin) ───────────────────────────────────────

async def platform_stats(db: AsyncSession) -> dict:
    since_24h = datetime.utcnow() - timedelta(hours=24)

    # Total agents = enabled builtin configs + active custom agents
    total_builtin = (await db.execute(
        select(func.count()).select_from(SpaceBuiltinAgentConfig)
        .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
        .where(BuiltinAgentCatalog.platform_enabled == True)
    )).scalar() or 0

    total_custom = (await db.execute(
        select(func.count()).select_from(CustomAgent)
    )).scalar() or 0

    active_builtin = (await db.execute(
        select(func.count()).select_from(SpaceBuiltinAgentConfig)
        .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
        .where(BuiltinAgentCatalog.platform_enabled == True, SpaceBuiltinAgentConfig.enabled == True)
    )).scalar() or 0

    active_custom = (await db.execute(
        select(func.count()).select_from(CustomAgent).where(CustomAgent.active == True)
    )).scalar() or 0

    return {
        "total_orgs":     (await db.execute(select(func.count()).select_from(Space))).scalar(),
        "active_orgs":    (await db.execute(select(func.count()).select_from(Space).where(Space.active == True))).scalar(),
        "total_agents":   total_builtin + total_custom,
        "active_agents":  active_builtin + active_custom,
        "total_messages": (await db.execute(select(func.count()).select_from(ConversationLog))).scalar(),
        "messages_24h":   (await db.execute(select(func.count()).select_from(ConversationLog).where(ConversationLog.timestamp >= since_24h))).scalar(),
        "total_skills":   (await db.execute(select(func.count()).select_from(PromptSkill))).scalar(),
    }


async def list_agents_with_org(
    db: AsyncSession,
    space_id: Optional[uuid.UUID] = None,
    active: Optional[bool] = None,
) -> List[tuple]:
    """Returns list of (CustomAgent, org_slug, org_display_name)."""
    q = (
        select(CustomAgent, Space.slug, Space.display_name)
        .join(Space, CustomAgent.space_id == Space.id)
        # Eager-load the lazy relationship that to_dict() reads, otherwise
        # accessing it after the request triggers MissingGreenlet in async mode.
        .options(selectinload(CustomAgent.knowledge_bases))
        .order_by(Space.slug, CustomAgent.slug)
    )
    if space_id:
        q = q.where(CustomAgent.space_id == space_id)
    if active is not None:
        q = q.where(CustomAgent.active == active)
    return (await db.execute(q)).all()

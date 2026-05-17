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
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.org import Organization, AgentDefinition, PromptSkill, ConversationLog


# ── Organization ──────────────────────────────────────────────────────────────

async def get_org_by_id(db: AsyncSession, org_id: uuid.UUID) -> Optional[Organization]:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    return result.scalar_one_or_none()


async def get_org_by_slug(db: AsyncSession, slug: str) -> Optional[Organization]:
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    return result.scalar_one_or_none()


async def list_orgs(
    db: AsyncSession,
    search: Optional[str] = None,
    plan: Optional[str] = None,
    active: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[Organization], int]:
    q = select(Organization).order_by(desc(Organization.created_at))
    if search:
        q = q.where(
            Organization.slug.ilike(f"%{search}%") |
            Organization.display_name.ilike(f"%{search}%")
        )
    if plan:
        q = q.where(Organization.plan == plan)
    if active is not None:
        q = q.where(Organization.active == active)
    rows = (await db.execute(q.offset(offset).limit(limit))).scalars().all()
    total = (await db.execute(select(func.count()).select_from(Organization))).scalar()
    return rows, total


async def set_org_active(db: AsyncSession, org: Organization, active: bool) -> Organization:
    org.active = active
    await db.commit()
    await db.refresh(org)
    return org


async def set_org_plan(db: AsyncSession, org: Organization, plan: str) -> Organization:
    org.plan = plan
    await db.commit()
    await db.refresh(org)
    return org


# ── AgentDefinition ───────────────────────────────────────────────────────────

async def get_agent(db: AsyncSession, org_id: uuid.UUID, slug: str) -> Optional[AgentDefinition]:
    result = await db.execute(
        select(AgentDefinition).where(
            AgentDefinition.org_id == org_id,
            AgentDefinition.slug == slug,
        )
    )
    return result.scalar_one_or_none()


async def list_agents(
    db: AsyncSession,
    org_id: Optional[uuid.UUID] = None,
    active: Optional[bool] = None,
) -> List[AgentDefinition]:
    q = select(AgentDefinition)
    if org_id is not None:
        q = q.where(AgentDefinition.org_id == org_id)
    if active is not None:
        q = q.where(AgentDefinition.active == active)
    return (await db.execute(q)).scalars().all()


async def count_agents(db: AsyncSession, org_id: uuid.UUID, active_only: bool = False) -> int:
    q = select(func.count()).select_from(AgentDefinition).where(AgentDefinition.org_id == org_id)
    if active_only:
        q = q.where(AgentDefinition.active == True)
    return (await db.execute(q)).scalar()


# ── PromptSkill ───────────────────────────────────────────────────────────────

async def get_skill(db: AsyncSession, skill_id: uuid.UUID, org_id: uuid.UUID) -> Optional[PromptSkill]:
    result = await db.execute(
        select(PromptSkill).where(
            PromptSkill.id == skill_id,
            PromptSkill.org_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def list_skills(db: AsyncSession, org_id: uuid.UUID) -> List[PromptSkill]:
    result = await db.execute(select(PromptSkill).where(PromptSkill.org_id == org_id))
    return result.scalars().all()


async def count_skills(db: AsyncSession, org_id: uuid.UUID) -> int:
    return (await db.execute(
        select(func.count()).select_from(PromptSkill).where(PromptSkill.org_id == org_id)
    )).scalar()


# ── ConversationLog ───────────────────────────────────────────────────────────

async def count_messages(db: AsyncSession, org_id: Optional[uuid.UUID] = None) -> int:
    q = select(func.count()).select_from(ConversationLog)
    if org_id:
        q = q.where(ConversationLog.org_id == org_id)
    return (await db.execute(q)).scalar()


async def count_messages_since(db: AsyncSession, since: datetime, org_id: Optional[uuid.UUID] = None) -> int:
    q = select(func.count()).select_from(ConversationLog).where(ConversationLog.timestamp >= since)
    if org_id:
        q = q.where(ConversationLog.org_id == org_id)
    return (await db.execute(q)).scalar()


async def list_logs(
    db: AsyncSession,
    org_id: Optional[uuid.UUID] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[tuple]:
    """Returns list of (ConversationLog, org_slug, org_display_name)."""
    q = (
        select(ConversationLog, Organization.slug, Organization.display_name)
        .join(Organization, ConversationLog.org_id == Organization.id)
        .order_by(desc(ConversationLog.timestamp))
    )
    if org_id:
        q = q.where(ConversationLog.org_id == org_id)
    return (await db.execute(q.offset(offset).limit(limit))).all()


async def analytics_for_org(db: AsyncSession, org_id: uuid.UUID, days: int) -> dict:
    since = datetime.utcnow() - timedelta(days=days)

    total = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.org_id == org_id,
            ConversationLog.role == "user",
            ConversationLog.timestamp >= since,
        )
    )).scalar() or 0

    rag_hits = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.org_id == org_id,
            ConversationLog.rag_hit == True,
            ConversationLog.timestamp >= since,
        )
    )).scalar() or 0

    avg_ms = (await db.execute(
        select(func.avg(ConversationLog.response_ms)).where(
            ConversationLog.org_id == org_id,
            ConversationLog.timestamp >= since,
        )
    )).scalar()

    intent_rows = (await db.execute(
        select(ConversationLog.intent, func.count().label("cnt")).where(
            ConversationLog.org_id == org_id,
            ConversationLog.role == "user",
            ConversationLog.timestamp >= since,
        ).group_by(ConversationLog.intent)
    )).all()

    agent_rows = (await db.execute(
        select(ConversationLog.agent_slug, func.count().label("cnt")).where(
            ConversationLog.org_id == org_id,
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
    return {
        "total_orgs":     (await db.execute(select(func.count()).select_from(Organization))).scalar(),
        "active_orgs":    (await db.execute(select(func.count()).select_from(Organization).where(Organization.active == True))).scalar(),
        "total_agents":   (await db.execute(select(func.count()).select_from(AgentDefinition))).scalar(),
        "active_agents":  (await db.execute(select(func.count()).select_from(AgentDefinition).where(AgentDefinition.active == True))).scalar(),
        "total_messages": (await db.execute(select(func.count()).select_from(ConversationLog))).scalar(),
        "messages_24h":   (await db.execute(select(func.count()).select_from(ConversationLog).where(ConversationLog.timestamp >= since_24h))).scalar(),
        "total_skills":   (await db.execute(select(func.count()).select_from(PromptSkill))).scalar(),
    }


async def list_agents_with_org(
    db: AsyncSession,
    org_id: Optional[uuid.UUID] = None,
    active: Optional[bool] = None,
) -> List[tuple]:
    """Returns list of (AgentDefinition, org_slug, org_display_name)."""
    q = (
        select(AgentDefinition, Organization.slug, Organization.display_name)
        .join(Organization, AgentDefinition.org_id == Organization.id)
        .order_by(Organization.slug, AgentDefinition.slug)
    )
    if org_id:
        q = q.where(AgentDefinition.org_id == org_id)
    if active is not None:
        q = q.where(AgentDefinition.active == active)
    return (await db.execute(q)).all()

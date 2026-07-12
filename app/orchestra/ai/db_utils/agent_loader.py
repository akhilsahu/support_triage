"""
DB ops for loading agents — custom and builtin — into ResolvedAgent objects.

All DB access for the orchestra layer goes through here.
No SQLAlchemy queries should appear in agents/, workflows/, or executor.py.
"""

from __future__ import annotations
from typing import Any, List, Optional
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.resolved_agent import ResolvedAgent
from app.models.space import (
    CustomAgent,
    ChatbotCustomAgent,
    SpaceBuiltinAgentConfig,
    BuiltinAgentCatalog,
)

logger = structlog.get_logger()


async def load_custom_agents_for_chatbot(
    db: AsyncSession,
    chatbot_id: UUID,
) -> List[ResolvedAgent]:
    """
    Load all active CustomAgents linked to a chatbot via the junction table.
    Returns ResolvedAgent list — callers never touch SQLAlchemy models directly.
    """
    result = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .join(ChatbotCustomAgent, ChatbotCustomAgent.agent_id == CustomAgent.id)
        .where(
            ChatbotCustomAgent.chatbot_id == chatbot_id,
            CustomAgent.active == True,
        )
    )
    agents = result.scalars().all()
    resolved = [ResolvedAgent.from_custom(a) for a in agents]
    logger.info("db_utils.custom_agents_loaded", chatbot_id=str(chatbot_id), count=len(resolved))
    return resolved


async def load_builtin_agents_for_chatbot(
    db: AsyncSession,
    chatbot_id: UUID,
) -> List[ResolvedAgent]:
    """
    Load platform-enabled + org-enabled builtin agents for a chatbot.
    Two-factor visibility: catalog.platform_enabled AND config.enabled.
    """
    result = await db.execute(
        select(SpaceBuiltinAgentConfig)
        .options(selectinload(SpaceBuiltinAgentConfig.catalog))
        .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
        .where(
            SpaceBuiltinAgentConfig.chatbot_id == chatbot_id,
            BuiltinAgentCatalog.platform_enabled == True,
            SpaceBuiltinAgentConfig.enabled == True,
        )
    )
    configs = result.scalars().all()
    resolved = [ResolvedAgent.from_builtin(c) for c in configs]
    logger.info("db_utils.builtin_agents_loaded", chatbot_id=str(chatbot_id), count=len(resolved))
    return resolved


async def load_all_active_agents(
    db: AsyncSession,
    chatbot_id: UUID,
) -> List[ResolvedAgent]:
    """
    Load all active agents (builtin + custom) for a chatbot.
    Single call used by the executor (core/factory) and workflows.
    """
    builtin = await load_builtin_agents_for_chatbot(db, chatbot_id)
    custom  = await load_custom_agents_for_chatbot(db, chatbot_id)
    return builtin + custom


async def load_custom_agent_by_slug(
    db: AsyncSession,
    space_id: UUID,
    slug: str,
) -> Optional[ResolvedAgent]:
    """
    Load a single CustomAgent by org + slug.
    Used when building a standalone custom agent outside the team flow.
    """
    result = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .where(
            CustomAgent.space_id == space_id,
            CustomAgent.slug   == slug,
            CustomAgent.active == True,
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        logger.warning("db_utils.custom_agent_not_found", space_id=str(space_id), slug=slug)
        return None
    return ResolvedAgent.from_custom(agent)


async def load_custom_agents_for_org(
    db: AsyncSession,
    space_id: UUID,
) -> List[ResolvedAgent]:
    """
    Load all active CustomAgents for an org regardless of chatbot.
    Used by workflows that operate at org level (e.g. onboarding).
    """
    result = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .where(CustomAgent.space_id == space_id, CustomAgent.active == True)
    )
    agents = result.scalars().all()
    resolved = [ResolvedAgent.from_custom(a) for a in agents]
    logger.info("db_utils.org_agents_loaded", space_id=str(space_id), count=len(resolved))
    return resolved


async def load_skills_for_agent(
    db: AsyncSession,
    skill_ids: List[str],
) -> List[Any]:
    """
    Load active PromptSkill rows by UUID list.

    Called by the orchestrator before building each agent so DB-stored
    skills are resolved and injected into the agent's system prompt.

    Args:
        db:        AsyncSession
        skill_ids: List of PromptSkill UUID strings from agent.skills_list

    Returns:
        List of PromptSkill ORM objects (active only, preserves order).
    """
    if not skill_ids:
        return []

    from uuid import UUID as _UUID
    from app.models.space import PromptSkill
    from sqlalchemy import select as _select

    try:
        uuids = [_UUID(sid) for sid in skill_ids if sid]
    except ValueError as e:
        logger.warning("db_utils.skills_invalid_uuid", error=str(e))
        return []

    if not uuids:
        return []

    result = await db.execute(
        _select(PromptSkill).where(
            PromptSkill.id.in_(uuids),
            PromptSkill.active == True,
        )
    )
    skills = result.scalars().all()

    # Preserve the order defined in skills_list
    skill_map = {str(s.id): s for s in skills}
    ordered   = [skill_map[sid] for sid in skill_ids if sid in skill_map]

    logger.info(
        "db_utils.skills_loaded",
        requested=len(skill_ids),
        loaded=len(ordered),
    )
    return ordered

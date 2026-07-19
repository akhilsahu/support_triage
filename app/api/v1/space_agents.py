"""
Org Agents API — JWT-protected endpoints for managing an org's agents.

Built-in agents live in:
  builtin_agent_catalog  (platform definitions)
  org_builtin_agent_configs  (per-org opt-in + overrides)

Custom agents live in:
  custom_agents

GET  /org/agents          — list all visible agents for the org
GET  /org/agents/{id}     — get single agent
PATCH /org/agents/{id}   — update config (builtin or custom)
POST  /org/agents         — create new custom agent
DELETE /org/agents/{id}   — delete custom agent
"""

from __future__ import annotations

import json
import re
from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
from app.models.space import (
    Space,
    BuiltinAgentCatalog,
    SpaceBuiltinAgentConfig,
    CustomAgent,
    ChatbotCustomAgent,
)
from app.models.knowledge_base import AgentKnowledgeBase
from app.models.chatbot import Chatbot

logger = structlog.get_logger()
router = APIRouter(prefix="/org/agents", tags=["Space Agents"])


async def _get_default_chatbot(db: AsyncSession, org: Space) -> Chatbot:
    """Resolve the org's default chatbot. Raises 503 if none configured."""
    result = await db.execute(
        select(Chatbot).where(
            Chatbot.space_id == org.id,
            Chatbot.is_default == True,
            Chatbot.active == True,
        )
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        raise HTTPException(503, "No default chatbot configured for this org.")
    return chatbot


async def _resolve_chatbot(db: AsyncSession, org: Space, chatbot_id: Optional[UUID]) -> Chatbot:
    """
    Resolve the target chatbot for an agent-management request.

    chatbot_id lets the dashboard's chatbot switcher scope agent list/create/update
    to a specific bot; omitted (None) falls back to the space's default bot, so
    every existing caller that doesn't pass it keeps today's behavior unchanged.
    """
    if chatbot_id is None:
        return await _get_default_chatbot(db, org)
    result = await db.execute(
        select(Chatbot).where(
            Chatbot.id == chatbot_id,
            Chatbot.space_id == org.id,
            Chatbot.active == True,
        )
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        raise HTTPException(404, "Chatbot not found for this space.")
    return chatbot


# ── Request / Response ────────────────────────────────────────────────────────

class AgentUpdateRequest(BaseModel):
    name:          Optional[str] = None
    description:   Optional[str] = None
    system_prompt: Optional[str] = None
    temperature:   Optional[float] = Field(None, ge=0.0, le=1.0)
    max_tokens:    Optional[int] = Field(None, ge=50, le=4000)
    active:        Optional[bool] = None   # custom agents only
    enabled:       Optional[bool] = None   # builtin configs only
    keywords:      Optional[List[str]] = None
    rag_enabled:   Optional[bool] = None
    rag_doc_types: Optional[List[str]] = None
    rag_top_k:     Optional[int] = Field(None, ge=1, le=20)
    kb_ids:        Optional[List[str]] = None   # knowledge base UUIDs


class CreateAgentRequest(BaseModel):
    name:          str
    description:   str = ""
    icon:          str = "🤖"
    system_prompt: str = ""
    temperature:   float = Field(0.4, ge=0.0, le=1.0)
    max_tokens:    int = Field(500, ge=50, le=4000)
    rag_enabled:   bool = False
    rag_doc_types: List[str] = []
    rag_top_k:     int = Field(5, ge=1, le=20)
    keywords:      List[str] = []
    kb_ids:        List[str] = []


class AgentOut(BaseModel):
    id:            str
    slug:          str
    name:          str
    description:   str
    agent_type:    str
    icon:          str
    is_builtin:    bool
    active:        bool   # for custom; for builtin = config.enabled
    system_prompt: str
    temperature:   float
    max_tokens:    int
    rag_enabled:   bool
    rag_doc_types: List[str]
    rag_top_k:     int
    keywords:      List[str]
    kb_ids:        List[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _builtin_out(config: SpaceBuiltinAgentConfig) -> AgentOut:
    cat = config.catalog
    return AgentOut(
        id=str(config.id),
        slug=cat.slug,
        name=cat.name,
        description=cat.description or "",
        agent_type=cat.agent_type,
        icon=cat.icon or "🤖",
        is_builtin=True,
        active=config.enabled,
        system_prompt=config.system_prompt or "",
        temperature=config.effective_temperature,
        max_tokens=config.effective_max_tokens,
        rag_enabled=config.effective_rag_enabled,
        rag_doc_types=config.effective_rag_doc_types_list,
        rag_top_k=config.effective_rag_top_k,
        keywords=config.keywords_list,
        kb_ids=[],
    )


def _custom_out(agent: CustomAgent) -> AgentOut:
    return AgentOut(
        id=str(agent.id),
        slug=agent.slug,
        name=agent.name,
        description=agent.description or "",
        agent_type="custom",
        icon=agent.icon or "🤖",
        is_builtin=False,
        active=agent.active,
        system_prompt=agent.system_prompt or "",
        temperature=agent.temperature,
        max_tokens=agent.max_tokens,
        rag_enabled=agent.rag_enabled,
        rag_doc_types=agent.rag_doc_types_list,
        rag_top_k=agent.rag_top_k,
        keywords=agent.keywords_list,
        kb_ids=[str(lnk.kb_id) for lnk in agent.knowledge_bases] if agent.knowledge_bases else [],
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

def _builtin_out_from_catalog(cat: BuiltinAgentCatalog) -> AgentOut:
    """AgentOut for a platform-enabled builtin the org has not yet configured."""
    return AgentOut(
        id=str(cat.id),          # use catalog id as placeholder
        slug=cat.slug,
        name=cat.name,
        description=cat.description or "",
        agent_type=cat.agent_type,
        icon=cat.icon or "🤖",
        is_builtin=True,
        active=False,            # org hasn't enabled it yet
        system_prompt="",
        temperature=cat.default_temperature,
        max_tokens=cat.default_max_tokens,
        rag_enabled=cat.default_rag_enabled,
        rag_doc_types=cat.default_rag_doc_types_list,
        rag_top_k=cat.default_rag_top_k,
        keywords=[],
        kb_ids=[],
    )


@router.get("", response_model=List[AgentOut])
async def list_space_agents(
    chatbot_id: Optional[UUID] = Query(None, description="Scope to a specific chatbot; omitted = default"),
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all agents visible to the target chatbot (default when chatbot_id omitted):
    - Built-ins: all platform_enabled catalog entries (Factor 1).
      Config row may or may not exist (chatbot may not have enabled it yet).
    - Custom: all custom agents for this chatbot.
    """
    chatbot = await _resolve_chatbot(db, org, chatbot_id)

    # All platform-enabled catalog entries
    catalog_result = await db.execute(
        select(BuiltinAgentCatalog)
        .where(BuiltinAgentCatalog.platform_enabled == True)
        .order_by(BuiltinAgentCatalog.agent_type)
    )
    catalog_entries = catalog_result.scalars().all()

    # Existing configs for this chatbot (only for platform-enabled catalog entries)
    catalog_ids = [c.id for c in catalog_entries]
    config_result = await db.execute(
        select(SpaceBuiltinAgentConfig)
        .options(selectinload(SpaceBuiltinAgentConfig.catalog))
        .where(
            SpaceBuiltinAgentConfig.chatbot_id == chatbot.id,
            SpaceBuiltinAgentConfig.catalog_id.in_(catalog_ids) if catalog_ids else False,
        )
    )
    configs_by_catalog = {c.catalog_id: c for c in config_result.scalars().all()}

    # Custom agents linked to this chatbot via junction
    custom_result = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .join(ChatbotCustomAgent, ChatbotCustomAgent.agent_id == CustomAgent.id)
        .where(ChatbotCustomAgent.chatbot_id == chatbot.id)
        .order_by(CustomAgent.created_at)
    )
    custom_agents = custom_result.scalars().all()

    agents: List[AgentOut] = []
    for cat in catalog_entries:
        config = configs_by_catalog.get(cat.id)
        if config:
            agents.append(_builtin_out(config))
        else:
            agents.append(_builtin_out_from_catalog(cat))
    for ca in custom_agents:
        agents.append(_custom_out(ca))

    return agents


@router.get("/{agent_id}", response_model=AgentOut)
async def get_org_agent(
    agent_id: UUID,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    # Try builtin config first
    bc = await db.execute(
        select(SpaceBuiltinAgentConfig)
        .options(selectinload(SpaceBuiltinAgentConfig.catalog))
        .where(SpaceBuiltinAgentConfig.id == agent_id, SpaceBuiltinAgentConfig.space_id == org.id)
    )
    config = bc.scalar_one_or_none()
    if config:
        return _builtin_out(config)

    # Try custom agent
    ca = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .where(CustomAgent.id == agent_id, CustomAgent.space_id == org.id)
    )
    agent = ca.scalar_one_or_none()
    if agent:
        return _custom_out(agent)

    raise HTTPException(status_code=404, detail="Agent not found.")


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_org_agent(
    agent_id: UUID,
    req: AgentUpdateRequest,
    chatbot_id: Optional[UUID] = Query(None, description="Target chatbot when first-enabling a builtin; omitted = default"),
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    # ── Builtin: agent_id may be catalog.id (no config yet) or config.id ────────
    # First check if it's a catalog id with no config (org enabling for first time)
    cat_result = await db.execute(
        select(BuiltinAgentCatalog).where(BuiltinAgentCatalog.id == agent_id)
    )
    catalog_entry = cat_result.scalar_one_or_none()

    if catalog_entry:
        if not catalog_entry.platform_enabled:
            raise HTTPException(403, "This agent is not available on the platform.")
        if catalog_entry.locked and req.enabled is False:
            raise HTTPException(400, f"{catalog_entry.name} cannot be disabled.")

        chatbot = await _resolve_chatbot(db, org, chatbot_id)

        # Check if config already exists for this chatbot
        existing = await db.execute(
            select(SpaceBuiltinAgentConfig)
            .options(selectinload(SpaceBuiltinAgentConfig.catalog))
            .where(
                SpaceBuiltinAgentConfig.chatbot_id == chatbot.id,
                SpaceBuiltinAgentConfig.catalog_id == catalog_entry.id,
            )
        )
        config = existing.scalar_one_or_none()

        if config is None:
            # Only create config row when chatbot is enabling for the first time
            if not req.enabled:
                raise HTTPException(400, "Enable the agent before configuring it.")
            config = SpaceBuiltinAgentConfig(
                space_id=org.id,
                chatbot_id=chatbot.id,
                catalog_id=catalog_entry.id,
                enabled=True,
                system_prompt=req.system_prompt or "",
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                rag_enabled=req.rag_enabled,
                rag_doc_types=",".join(req.rag_doc_types) if req.rag_doc_types else None,
                rag_top_k=req.rag_top_k,
                keywords_json=json.dumps(req.keywords) if req.keywords else "[]",
            )
            db.add(config)
        else:
            # Update existing config
            if req.enabled is not None:
                config.enabled = req.enabled
            if req.system_prompt is not None:
                config.system_prompt = req.system_prompt
            if req.temperature is not None:
                config.temperature = req.temperature
            if req.max_tokens is not None:
                config.max_tokens = req.max_tokens
            if req.rag_enabled is not None:
                config.rag_enabled = req.rag_enabled
            if req.rag_doc_types is not None:
                config.rag_doc_types = ",".join(req.rag_doc_types)
            if req.rag_top_k is not None:
                config.rag_top_k = req.rag_top_k
            if req.keywords is not None:
                config.keywords_json = json.dumps(req.keywords)

        await db.commit()
        await db.refresh(config)
        from app.orchestra.ai.session.pool import pool as _pool
        _pool.invalidate_bot_agents(str(org.id))
        return _builtin_out(config)

    # ── Custom agent update ────────────────────────────────────────────────────
    ca = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .where(CustomAgent.id == agent_id, CustomAgent.space_id == org.id)  # org check for ownership
    )
    agent = ca.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found.")

    if req.name is not None:
        name_stripped = req.name.strip()
        if name_stripped and name_stripped.lower() != agent.name.lower():
            dupe = await db.execute(
                select(CustomAgent).where(
                    CustomAgent.space_id == org.id,
                    CustomAgent.name.ilike(name_stripped),
                    CustomAgent.id != agent.id,
                )
            )
            if dupe.scalar_one_or_none():
                raise HTTPException(409, f"An agent named '{name_stripped}' already exists.")
        agent.name = name_stripped
    if req.description is not None:
        agent.description = req.description
    if req.system_prompt is not None:
        agent.system_prompt = req.system_prompt
    if req.temperature is not None:
        agent.temperature = req.temperature
    if req.max_tokens is not None:
        agent.max_tokens = req.max_tokens
    if req.active is not None:
        agent.active = req.active
    if req.keywords is not None:
        agent.keywords_json = json.dumps(req.keywords)
    if req.rag_enabled is not None:
        agent.rag_enabled = req.rag_enabled
    if req.rag_doc_types is not None:
        agent.rag_doc_types = ",".join(req.rag_doc_types)
    if req.rag_top_k is not None:
        agent.rag_top_k = req.rag_top_k
    if req.kb_ids is not None:
        from uuid import UUID as _UUID
        await db.execute(delete(AgentKnowledgeBase).where(AgentKnowledgeBase.agent_id == agent.id))
        for kb_id in set(req.kb_ids):
            db.add(AgentKnowledgeBase(agent_id=agent.id, kb_id=_UUID(kb_id)))

    await db.commit()
    from app.orchestra.ai.session.pool import pool as _pool
    _pool.invalidate_bot_agents(str(org.id))
    res = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .where(CustomAgent.id == agent.id)
    )
    agent = res.scalar_one()
    return _custom_out(agent)


@router.post("", response_model=AgentOut, status_code=201)
async def create_org_agent(
    req: CreateAgentRequest,
    chatbot_id: Optional[UUID] = Query(None, description="Chatbot to link the new agent to; omitted = default"),
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    # Reject duplicate names within the same space (case-insensitive)
    name_check = await db.execute(
        select(CustomAgent).where(
            CustomAgent.space_id == org.id,
            CustomAgent.name.ilike(req.name.strip()),
        )
    )
    if name_check.scalar_one_or_none():
        raise HTTPException(409, f"An agent named '{req.name.strip()}' already exists.")

    base_slug = re.sub(r"[^a-z0-9_]", "_", req.name.lower().strip())[:40].strip("_")
    slug = base_slug
    i = 1
    while True:
        existing = await db.execute(
            select(CustomAgent).where(CustomAgent.space_id == org.id, CustomAgent.slug == slug)
        )
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}_{i}"
        i += 1

    chatbot = await _resolve_chatbot(db, org, chatbot_id)

    agent = CustomAgent(
        space_id=org.id,
        slug=slug,
        name=req.name,
        description=req.description,
        icon=req.icon,
        system_prompt=req.system_prompt,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        rag_enabled=req.rag_enabled,
        rag_doc_types=",".join(req.rag_doc_types),
        rag_top_k=req.rag_top_k,
        keywords_json=json.dumps(req.keywords),
        active=True,
    )
    db.add(agent)
    await db.flush()

    # Link to the target chatbot (many-to-many junction)
    db.add(ChatbotCustomAgent(chatbot_id=chatbot.id, agent_id=agent.id))

    if req.kb_ids:
        from uuid import UUID as _UUID
        for kb_id in set(req.kb_ids):
            db.add(AgentKnowledgeBase(agent_id=agent.id, kb_id=_UUID(kb_id)))

    await db.commit()
    res = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
        .where(CustomAgent.id == agent.id)
    )
    agent = res.scalar_one()
    logger.info("custom_agent.created", space_id=str(org.id), slug=slug)
    return _custom_out(agent)


@router.delete("/{agent_id}", status_code=204)
async def delete_org_agent(
    agent_id: UUID,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    ca = await db.execute(
        select(CustomAgent).where(CustomAgent.id == agent_id, CustomAgent.space_id == org.id)
    )
    agent = ca.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Custom agent not found.")
    await db.delete(agent)
    await db.commit()
    from app.orchestra.ai.session.pool import pool as _pool
    _pool.invalidate_bot_agents(str(org.id))
    logger.info("custom_agent.deleted", space_id=str(org.id), agent_id=str(agent_id))


# ── Knowledge base chunks ─────────────────────────────────────────────────────

kb_router = APIRouter(prefix="/org/kb", tags=["Space Knowledge Base"])


@kb_router.get("/{doc_id}/chunks")
async def get_org_doc_chunks(
    doc_id: str,
    org: Space = Depends(current_space),
):
    from app.rag.vector_store import get_vector_store
    store = get_vector_store()
    chunks = store.get_doc_chunks(client_id=str(org.id), doc_id=doc_id)
    return {"doc_id": doc_id, "org_slug": org.slug, "chunks": chunks, "total": len(chunks)}

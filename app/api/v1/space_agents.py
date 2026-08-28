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

from app.utils.slug import slugify as _slugify


class KBAssignment(BaseModel):
    kb_id: str
    doc_ids: Optional[List[str]] = Field(default_factory=list)


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
    kb_assignments: Optional[List[KBAssignment]] = None   # granular KB & doc selection
    # Topic slugs this agent answers for. Empty/omitted = every document in its
    # linked KBs, which is how agents behaved before topics existed.
    topics:        Optional[List[str]] = None
    # URL-safe routing key, unique per space. Omitted = unchanged.
    slug:          Optional[str] = None
    # Per-agent LLM override. Explicit null = inherit the chatbot default.
    # llm_model is provider-prefixed ("openai/gpt-4o-mini"); reasoning_effort
    # is '' (off) | low | medium | high.
    llm_model:        Optional[str] = None
    reasoning_effort: Optional[str] = None


class CreateAgentRequest(BaseModel):
    name:          str
    description:   str = ""
    icon:          str = "🤖"
    system_prompt: str = ""
    temperature:   float = Field(0.4, ge=0.0, le=1.0)
    max_tokens:    int = Field(500, ge=50, le=4000)
    rag_enabled:   bool = False
    rag_doc_types: Optional[List[str]] = Field(default_factory=list)
    rag_top_k:     int = Field(5, ge=1, le=20)
    keywords:      List[str] = []
    kb_ids:        List[str] = []
    kb_assignments: Optional[List[KBAssignment]] = None   # granular KB & doc selection
    topics:        List[str] = []
    # URL-safe routing key, unique per space. Omitted/blank = auto-derived from name.
    slug:          Optional[str] = None
    # Per-agent LLM override. llm_model is provider-prefixed
    # ("openai/gpt-4o-mini"); reasoning_effort is '' (off) | low | medium | high.
    llm_model:        Optional[str] = None
    reasoning_effort: Optional[str] = None


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
    kb_assignments: Optional[List[KBAssignment]] = None
    topics:        List[str] = []
    llm_model:        Optional[str] = None
    reasoning_effort: Optional[str] = None


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
        kb_assignments=[],
        llm_model=config.llm_model,
        reasoning_effort=config.reasoning_effort,
    )


def _custom_out(agent: CustomAgent) -> AgentOut:
    kb_assignments = []
    kb_ids = []
    if agent.knowledge_bases:
        for lnk in agent.knowledge_bases:
            kstr = str(lnk.kb_id)
            kb_ids.append(kstr)
            kb_assignments.append(KBAssignment(
                kb_id=kstr,
                doc_ids=lnk.doc_ids or []
            ))
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
        kb_ids=kb_ids,
        kb_assignments=kb_assignments,
        topics=agent.topics_list,
        llm_model=agent.llm_model,
        reasoning_effort=agent.reasoning_effort,
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
        llm_model=None,
        reasoning_effort=None,
    )


def _apply_builtin_update(config: SpaceBuiltinAgentConfig, req: AgentUpdateRequest) -> None:
    """Apply an AgentUpdateRequest to an existing builtin config row in place."""
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
    # Explicit null clears the override (inherit the chatbot default).
    if "llm_model" in req.model_fields_set:
        config.llm_model = (req.llm_model or "").strip() or None
    if "reasoning_effort" in req.model_fields_set:
        # Explicit null = inherit chatbot default; '' (off) and
        # low|medium|high are distinct stored values.
        if req.reasoning_effort is None:
            config.reasoning_effort = None
        else:
            val = req.reasoning_effort.strip().lower()
            if val not in ("", "low", "medium", "high"):
                raise HTTPException(400, "reasoning_effort must be null | '' | low | medium | high.")
            config.reasoning_effort = val


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
    # ── Builtin config id: the row backing an already-enabled builtin (e.g.
    # triage). The UI sends this id for builtins with an existing config row
    # (_builtin_out returns config.id); without this branch such an id fell
    # through to the custom lookup and 404'd.
    bc = await db.execute(
        select(SpaceBuiltinAgentConfig)
        .options(selectinload(SpaceBuiltinAgentConfig.catalog))
        .where(
            SpaceBuiltinAgentConfig.id == agent_id,
            SpaceBuiltinAgentConfig.space_id == org.id,
        )
    )
    config = bc.scalar_one_or_none()
    if config:
        if config.catalog.locked and req.enabled is False:
            raise HTTPException(400, f"{config.catalog.name} cannot be disabled.")
        _apply_builtin_update(config, req)
        await db.commit()
        await db.refresh(config)
        from app.orchestra.ai.session.pool import pool as _pool
        _pool.invalidate_bot_agents(str(org.id))
        return _builtin_out(config)

    # ── Builtin catalog id: platform definition, no config row yet (org
    # enabling it for the first time) ──────────────────────────────────────────
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
                llm_model=req.llm_model,
                reasoning_effort=req.reasoning_effort,
            )
            db.add(config)
        else:
            _apply_builtin_update(config, req)

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
    if req.topics is not None:
        from app.utils.slug import slugify
        agent.topics = ",".join(t for t in (slugify(x) for x in req.topics) if t)
    if req.slug is not None:
        new_slug = _slugify(req.slug, max_len=80) if req.slug.strip() else ""
        if not new_slug:
            raise HTTPException(400, "Agent slug must contain at least one letter, number, or underscore.")
        if new_slug == "triage":
            raise HTTPException(400, "Slug 'triage' is reserved.")
        dupe = await db.execute(
            select(CustomAgent).where(
                CustomAgent.space_id == org.id,
                CustomAgent.slug == new_slug,
                CustomAgent.id != agent.id,
            )
        )
        if dupe.scalar_one_or_none():
            raise HTTPException(409, f"Agent slug '{new_slug}' already exists.")
        agent.slug = new_slug
    # LLM overrides: explicit null clears the override (inherit chatbot default).
    if "llm_model" in req.model_fields_set:
        agent.llm_model = (req.llm_model or "").strip() or None
    if "reasoning_effort" in req.model_fields_set:
        # Explicit null = inherit chatbot default; '' (off) and low|medium|high
        # are distinct stored values.
        if req.reasoning_effort is None:
            agent.reasoning_effort = None
        else:
            val = req.reasoning_effort.strip().lower()
            if val not in ("", "low", "medium", "high"):
                raise HTTPException(400, "reasoning_effort must be null | '' | low | medium | high.")
            agent.reasoning_effort = val
    if req.kb_assignments is not None or req.kb_ids is not None:
        from uuid import UUID as _UUID
        await db.execute(delete(AgentKnowledgeBase).where(AgentKnowledgeBase.agent_id == agent.id))
        assignments = req.kb_assignments if req.kb_assignments is not None else [
            KBAssignment(kb_id=k, doc_ids=[]) for k in (req.kb_ids or [])
        ]
        seen_kbs = set()
        for asgn in assignments:
            if asgn.kb_id in seen_kbs:
                continue
            seen_kbs.add(asgn.kb_id)
            db.add(AgentKnowledgeBase(
                agent_id=agent.id,
                kb_id=_UUID(asgn.kb_id),
                doc_ids=asgn.doc_ids if asgn.doc_ids else None
            ))

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

    effort = None if req.reasoning_effort is None else req.reasoning_effort.strip().lower()
    if effort is not None and effort not in ("", "low", "medium", "high"):
        raise HTTPException(400, "reasoning_effort must be null | '' | low | medium | high.")

    if req.slug and req.slug.strip():
        slug = _slugify(req.slug, max_len=80)
        if not slug:
            raise HTTPException(400, "Agent slug must contain at least one letter, number, or underscore.")
        if slug == "triage":
            raise HTTPException(400, "Slug 'triage' is reserved.")
        existing = await db.execute(
            select(CustomAgent).where(CustomAgent.space_id == org.id, CustomAgent.slug == slug)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, f"Agent slug '{slug}' already exists.")
    else:
        base_slug = re.sub(r"[^a-z0-9_]", "_", req.name.lower().strip())[:40].strip("_")
        slug = base_slug
        i = 1
        while True:
            existing = await db.execute(
                select(CustomAgent).where(CustomAgent.space_id == org.id, CustomAgent.slug == slug)
            )
            if (not existing.scalar_one_or_none()) and slug != "triage":
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
        rag_doc_types=",".join(req.rag_doc_types) if req.rag_doc_types else "",
        rag_top_k=req.rag_top_k,
        llm_model=(req.llm_model or "").strip() or None,
        reasoning_effort=effort,
        keywords_json=json.dumps(req.keywords),
        topics=",".join(t for t in (_slugify(x) for x in req.topics) if t),
        active=True,
    )
    db.add(agent)
    await db.flush()

    # Link to the target chatbot (many-to-many junction)
    db.add(ChatbotCustomAgent(chatbot_id=chatbot.id, agent_id=agent.id))

    if req.kb_assignments or req.kb_ids:
        from uuid import UUID as _UUID
        assignments = req.kb_assignments if req.kb_assignments is not None else [
            KBAssignment(kb_id=k, doc_ids=[]) for k in (req.kb_ids or [])
        ]
        seen_kbs = set()
        for asgn in assignments:
            if asgn.kb_id in seen_kbs:
                continue
            seen_kbs.add(asgn.kb_id)
            db.add(AgentKnowledgeBase(
                agent_id=agent.id,
                kb_id=_UUID(asgn.kb_id),
                doc_ids=asgn.doc_ids if asgn.doc_ids else None
            ))

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
    _pool.invalidate_bot_agents(str(org.id))
    logger.info("custom_agent.deleted", space_id=str(org.id), agent_id=str(agent_id))


@router.post("/{agent_id}/generate-prompt")
async def generate_specialist_agent_prompt_endpoint(
    agent_id: UUID,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-generate a domain-focused Specialist System Prompt for this CustomAgent
    by analyzing its linked Knowledge Bases.
    """
    ca = await db.execute(
        select(CustomAgent).where(CustomAgent.id == agent_id, CustomAgent.space_id == org.id)
    )
    agent = ca.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Custom agent not found.")

    from app.utils.ai.triage_prompt_generator import generate_prompt_for_specialist_agent
    try:
        result = await generate_prompt_for_specialist_agent(db, agent.id, save_to_db=True)
        from app.orchestra.ai.session.pool import pool as _pool
        _pool.invalidate_bot_agents(str(org.id))
        return result
    except Exception as e:
        logger.error("generate_specialist_agent_prompt.failed", agent_id=str(agent_id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to generate agent prompt: {str(e)}")



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

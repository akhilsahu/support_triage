"""
Brand dashboard API — agent toggle/CRUD, skills CRUD, analytics, profile.
All endpoints require JWT (current_space dependency).
"""

from __future__ import annotations

import json
import uuid
from typing import List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import current_space
from app.models.space import Space, CustomAgent, PromptSkill
from app.api.db_utils import (
    get_agent, list_agents, get_skill, list_skills, count_skills,
    analytics_for_org,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ── Agents ────────────────────────────────────────────────────────────────────

@router.get("/agents")
async def list_agents_endpoint(
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    agents = await list_agents(db, space_id=org.id)
    return [a.to_dict() for a in agents]


class AgentToggleRequest(BaseModel):
    active: bool


@router.patch("/agents/{slug}/toggle")
async def toggle_agent(
    slug: str,
    req: AgentToggleRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    agent = await get_agent(db, org.id, slug)
    if not agent:
        raise HTTPException(404, f"Agent '{slug}' not found.")
    if slug == "triage":
        raise HTTPException(400, "Triage agent cannot be deactivated.")
    agent.active = req.active
    await db.commit()
    return agent.to_dict()


class AgentUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    rag_enabled: Optional[bool] = None
    rag_doc_types: Optional[List[str]] = None
    rag_top_k: Optional[int] = None
    keywords: Optional[List[str]] = None
    skills: Optional[List[str]] = None


@router.patch("/agents/{slug}")
async def update_agent(
    slug: str,
    req: AgentUpdateRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    agent = await get_agent(db, org.id, slug)
    if not agent:
        raise HTTPException(404, f"Agent '{slug}' not found.")

    if req.name is not None:          agent.name = req.name
    if req.description is not None:   agent.description = req.description
    if req.system_prompt is not None: agent.system_prompt = req.system_prompt
    if req.temperature is not None:   agent.temperature = req.temperature
    if req.max_tokens is not None:    agent.max_tokens = req.max_tokens
    if req.rag_enabled is not None:   agent.rag_enabled = req.rag_enabled
    if req.rag_doc_types is not None: agent.rag_doc_types = ",".join(req.rag_doc_types)
    if req.rag_top_k is not None:     agent.rag_top_k = req.rag_top_k
    if req.keywords is not None:      agent.keywords_json = json.dumps(req.keywords)
    if req.skills is not None:        agent.skills_json = json.dumps(req.skills)

    await db.commit()
    await db.refresh(agent)
    return agent.to_dict()


class CreateAgentRequest(BaseModel):
    slug: str
    name: str
    description: str = ""
    icon: str = "🤖"
    system_prompt: str = ""
    temperature: float = 0.4
    max_tokens: int = 500
    rag_enabled: bool = False
    rag_doc_types: List[str] = []
    rag_top_k: int = 5
    keywords: List[str] = []
    skills: List[str] = []


@router.post("/agents", status_code=201)
async def create_agent(
    req: CreateAgentRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    if await get_agent(db, org.id, req.slug):
        raise HTTPException(409, f"Agent slug '{req.slug}' already exists.")

    agent = CustomAgent(
        space_id=org.id,
        slug=req.slug,
        name=req.name,
        description=req.description,
        icon=req.icon,
        active=True,
        system_prompt=req.system_prompt,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        rag_enabled=req.rag_enabled,
        rag_doc_types=",".join(req.rag_doc_types),
        rag_top_k=req.rag_top_k,
        keywords_json=json.dumps(req.keywords),
        skills_json=json.dumps(req.skills),
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent.to_dict()


@router.delete("/agents/{slug}", status_code=204)
async def delete_agent(
    slug: str,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    agent = await get_agent(db, org.id, slug)
    if not agent:
        raise HTTPException(404, f"Agent '{slug}' not found.")
    # CustomAgent rows are all user-created — no is_builtin guard needed
    await db.delete(agent)
    await db.commit()


# ── Prompt Skills ─────────────────────────────────────────────────────────────

class SkillRequest(BaseModel):
    name: str
    description: str = ""
    skill_type: str = "instruction"
    prompt_text: str
    active: bool = True


@router.get("/skills")
async def list_skills_endpoint(
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    return [s.to_dict() for s in await list_skills(db, org.id)]


@router.post("/skills", status_code=201)
async def create_skill(
    req: SkillRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    skill = PromptSkill(
        space_id=org.id,
        name=req.name,
        description=req.description,
        skill_type=req.skill_type,
        prompt_text=req.prompt_text,
        active=req.active,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill.to_dict()


@router.patch("/skills/{skill_id}")
async def update_skill(
    skill_id: uuid.UUID,
    req: SkillRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill(db, skill_id, org.id)
    if not skill:
        raise HTTPException(404, "Skill not found.")
    skill.name = req.name
    skill.description = req.description
    skill.skill_type = req.skill_type
    skill.prompt_text = req.prompt_text
    skill.active = req.active
    await db.commit()
    await db.refresh(skill)
    return skill.to_dict()


@router.delete("/skills/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: uuid.UUID,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill(db, skill_id, org.id)
    if not skill:
        raise HTTPException(404, "Skill not found.")
    await db.delete(skill)
    await db.commit()


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def analytics(
    days: int = Query(7, ge=1, le=90),
    chatbot_id: Optional[uuid.UUID] = Query(None, description="Scope to a specific chatbot; omitted = space-wide"),
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_for_org(db, org.id, days, chatbot_id=chatbot_id)


# ── Profile ───────────────────────────────────────────────────────────────────

class OrganizationUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None
    show_rag_citations: Optional[bool] = None


@router.get("/profile")
async def get_profile(
    org: Space = Depends(current_space),
):
    return org.to_dict()


@router.get("/doc-types")
async def list_doc_types(
    org: Space = Depends(current_space),
):
    """Return distinct doc_types present in this org's knowledge base (ChromaDB)."""
    from app.rag.vector_store import get_vector_store
    import asyncio
    loop = asyncio.get_event_loop()
    doc_types = await loop.run_in_executor(
        None,
        lambda: get_vector_store().get_org_doc_types(str(org.id)),
    )
    return {"doc_types": doc_types}


@router.patch("/profile")
async def update_profile(
    req: OrganizationUpdateRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    name_changed = req.display_name and req.display_name != org.display_name

    if req.display_name: org.display_name = req.display_name
    if req.logo_url is not None: org.logo_url = req.logo_url
    if req.theme_color: org.theme_color = req.theme_color
    if req.show_rag_citations is not None: org.show_rag_citations = req.show_rag_citations
    await db.commit()
    await db.refresh(org)

    # Keep vector DB metadata in sync when display_name changes
    if name_changed:
        from app.rag.vector_store import get_vector_store
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_vector_store().update_org_name(str(org.id), org.display_name)
        )

    return org.to_dict()


# ── Dashboard Stats ───────────────────────────────────────────────────────────

@router.get("/stats")
async def dashboard_stats(
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    Single endpoint for all dashboard numbers:
    - stat cards (messages, rag hit rate, active agents, kb docs)
    - messages per day (last 7 days) for the chart
    - recent activity (last 5 conversation log entries)
    - agent fleet status
    """
    from datetime import datetime, timedelta
    from sqlalchemy import select, func, cast, Date
    from app.models.space import ConversationLog, CustomAgent
    from app.rag.vector_store import get_vector_store
    import asyncio

    now = datetime.utcnow()
    since_7d = now - timedelta(days=7)
    since_24h = now - timedelta(hours=24)

    # Total messages (user turns only)
    total_msgs = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.space_id == org.id,
            ConversationLog.role == "user",
        )
    )).scalar() or 0

    # Messages in last 24h
    msgs_24h = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.space_id == org.id,
            ConversationLog.role == "user",
            ConversationLog.timestamp >= since_24h,
        )
    )).scalar() or 0

    # RAG hits (last 7 days)
    rag_total = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.space_id == org.id,
            ConversationLog.role == "user",
            ConversationLog.timestamp >= since_7d,
        )
    )).scalar() or 0

    rag_hits = (await db.execute(
        select(func.count()).select_from(ConversationLog).where(
            ConversationLog.space_id == org.id,
            ConversationLog.rag_hit == True,
            ConversationLog.timestamp >= since_7d,
        )
    )).scalar() or 0

    rag_rate = round((rag_hits / rag_total * 100) if rag_total else 0)

    # Active agents
    active_agents = (await db.execute(
        select(func.count()).select_from(CustomAgent).where(
            CustomAgent.space_id == org.id,
            CustomAgent.active == True,
        )
    )).scalar() or 0

    # KB doc count (ChromaDB)
    loop = asyncio.get_event_loop()
    kb_docs = await loop.run_in_executor(
        None,
        lambda: len(get_vector_store().get_client_docs(str(org.id)))
    )

    # Messages per day — last 7 days
    day_rows = (await db.execute(
        select(
            cast(ConversationLog.timestamp, Date).label("day"),
            func.count().label("cnt"),
        )
        .where(
            ConversationLog.space_id == org.id,
            ConversationLog.role == "user",
            ConversationLog.timestamp >= since_7d,
        )
        .group_by("day")
        .order_by("day")
    )).all()

    # Fill in missing days with 0
    day_map = {str(r.day): r.cnt for r in day_rows}
    per_day = []
    for i in range(7):
        d = (since_7d + timedelta(days=i + 1)).date()
        per_day.append({
            "day": d.strftime("%a"),
            "date": str(d),
            "msgs": day_map.get(str(d), 0),
        })

    # Recent activity — last 5 user+assistant pairs
    recent_rows = (await db.execute(
        select(ConversationLog)
        .where(
            ConversationLog.space_id == org.id,
            ConversationLog.role == "user",
        )
        .order_by(ConversationLog.timestamp.desc())
        .limit(5)
    )).scalars().all()

    recent_activity = [
        {
            "agent_slug": r.agent_slug or "unknown",
            "message":    r.message[:80] + ("…" if len(r.message) > 80 else ""),
            "intent":     r.intent,
            "timestamp":  r.timestamp.isoformat() if r.timestamp else None,
        }
        for r in recent_rows
    ]

    # Agent fleet — custom agents for this space
    agents = (await db.execute(
        select(CustomAgent).where(CustomAgent.space_id == org.id)
    )).scalars().all()

    fleet = [
        {
            "slug":        a.slug,
            "name":        a.name,
            "icon":        a.icon or "🤖",
            "active":      a.active,
            "is_builtin":  False,
            "agent_type":  "custom",
            "description": a.description or "",
        }
        for a in agents
    ]

    return {
        "total_messages":  total_msgs,
        "messages_24h":    msgs_24h,
        "rag_hit_rate":    rag_rate,
        "active_agents":   active_agents,
        "kb_doc_count":    kb_docs,
        "messages_per_day": per_day,
        "recent_activity": recent_activity,
        "fleet":           fleet,
    }


# ── Nav Config ────────────────────────────────────────────────────────────────

@router.get("/nav-config")
async def get_nav_config(
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the list of nav item IDs this space can see.
    Resolution: system-wide enabled ∩ space override (if set).
    """
    import json
    from sqlalchemy import select as sa_select
    from app.models.space import PlatformSettings, ALL_NAV_ITEMS

    result = await db.execute(sa_select(PlatformSettings).limit(1))
    ps = result.scalar_one_or_none()
    system_cfg = ps.get_nav_config() if ps else {k: True for k in ALL_NAV_ITEMS}
    system_enabled = {k for k, v in system_cfg.items() if v}

    if org.enabled_nav_items:
        try:
            space_items = set(json.loads(org.enabled_nav_items))
            enabled = system_enabled & space_items
        except Exception:
            enabled = system_enabled
    else:
        enabled = system_enabled

    ordered = sorted(enabled, key=lambda x: ALL_NAV_ITEMS.index(x) if x in ALL_NAV_ITEMS else 99)
    return {"enabled_nav_items": ordered}


# ── Agent Meta Suggestions ────────────────────────────────────────────────────

class AgentSuggestionRequest(BaseModel):
    doc_types: List[str] = []
    doc_id: Optional[str] = None
    agent_name: Optional[str] = None   # used when doc_types is empty
    force: bool = False
    kb_ids: List[str] = []


class LinkAgentRequest(BaseModel):
    suggestion_id: str
    agent_id: str


@router.post("/agent-suggestions")
async def get_agent_suggestion(
    req: AgentSuggestionRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a cached AgentMetaSuggestion for this org + doc_types combo,
    or generate one via LLM and cache it.

    Subsequent calls with the same doc_types return instantly from DB — no LLM call.
    """
    from app.utils.ai.agent_meta_suggestion import get_or_generate
    from app.rag.vector_store import get_vector_store
    import asyncio

    # 1. If doc_types is empty but kb_ids is provided, resolve doc_types from KB items
    if not req.doc_types and req.kb_ids:
        from sqlalchemy import select
        from app.models.knowledge_base import KnowledgeBaseItem
        from uuid import UUID as _UUID

        try:
            uuid_kb_ids = [_UUID(kb_id) for kb_id in req.kb_ids]
        except ValueError:
            uuid_kb_ids = []

        if uuid_kb_ids:
            result = await db.execute(
                select(KnowledgeBaseItem).where(KnowledgeBaseItem.kb_id.in_(uuid_kb_ids))
            )
            items = result.scalars().all()
            
            doc_ids = []
            for item in items:
                if item.item_type == "doc" and item.doc_id:
                    doc_ids.append(item.doc_id)
                elif item.indexed_doc_id:
                    doc_ids.append(item.indexed_doc_id)

            kb_doc_types = set()
            loop = asyncio.get_event_loop()
            for doc_id in doc_ids:
                meta = await loop.run_in_executor(
                    None,
                    lambda d=doc_id: get_vector_store().get_doc_meta(d)
                )
                if meta and meta.get("doc_type"):
                    kb_doc_types.add(meta["doc_type"])
            
            if kb_doc_types:
                req.doc_types = list(kb_doc_types)

    # 2. If doc_types is still empty but doc_id is provided, resolve doc_type from doc_id metadata
    if not req.doc_types and req.doc_id:
        loop = asyncio.get_event_loop()
        meta = await loop.run_in_executor(
            None,
            lambda: get_vector_store().get_doc_meta(req.doc_id)
        )
        if meta and meta.get("doc_type"):
            req.doc_types = [meta["doc_type"]]

    if not req.doc_types and not req.agent_name:
        raise HTTPException(400, "Provide doc_types or agent_name.")

    try:
        return await get_or_generate(
            db=db,
            space_id=org.id,
            org_name=org.display_name,
            doc_types=req.doc_types,
            doc_id=req.doc_id,
            agent_name=req.agent_name,
            force=req.force,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("agent_suggestions_failed: %s", e)
        # Reset the session — a failed flush leaves it in PendingRollback, so any
        # later attribute reload (e.g. org.display_name) would raise again and the
        # fallback below would crash instead of returning.
        try:
            await db.rollback()
        except Exception:
            pass
        # Return a usable fallback so the wizard doesn't break
        name = req.agent_name or (org.display_name + " Support Agent")
        return {
            "suggestion_id": None,
            "name": name,
            "description": f"Handles customer support questions for {org.display_name}.",
            "system_prompt": (
                f"You are a customer support agent for {org.display_name}.\n\n"
                "Your role:\n"
                "- Answer customer questions accurately using the knowledge base provided\n"
                "- Be professional, concise, and helpful\n"
                "- If you cannot resolve the issue, escalate to human support\n\n"
                "Constraints:\n"
                "- Do not make up information — if unsure, say so\n"
                "- Stay on topic relevant to the business"
            ),
            "from_cache": False,
        }


@router.patch("/agent-suggestions/link")
async def link_suggestion_to_agent(
    req: LinkAgentRequest,
    org: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    After a custom agent is created from a suggestion, link the two rows.
    Marks the suggestion as used and enables future lookup by agent_id.
    """
    from app.utils.ai.agent_meta_suggestion import link_agent
    from uuid import UUID

    await link_agent(db, suggestion_id=req.suggestion_id, agent_id=UUID(req.agent_id))
    return {"ok": True}

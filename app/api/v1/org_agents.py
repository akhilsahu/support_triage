"""
Org Agents API — JWT-protected endpoints for managing an org's AgentDefinitions.

GET  /org/agents          — list all agents for the authenticated org
GET  /org/agents/{id}     — get single agent
PATCH /org/agents/{id}    — update system_prompt, temperature, max_tokens, active, keywords
"""

from __future__ import annotations

import json
import re
from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_brand
from app.core.database import get_db
from app.models.org import AgentDefinition, AgentDocLink, Organization
from app.rag.vector_store import get_vector_store

logger = structlog.get_logger()
router = APIRouter(prefix="/org/agents", tags=["Org Agents"])


# ── Request / Response ────────────────────────────────────────────────────────

class AgentUpdateRequest(BaseModel):
    """Fields an org admin can edit. All optional — only provided fields are updated."""
    system_prompt: Optional[str] = Field(None, description="Org-customised system prompt")
    temperature:   Optional[float] = Field(None, ge=0.0, le=1.0)
    max_tokens:    Optional[int] = Field(None, ge=50, le=4000)
    active:        Optional[bool] = None
    keywords:      Optional[List[str]] = None
    rag_enabled:   Optional[bool] = None
    rag_doc_types: Optional[List[str]] = None
    rag_top_k:     Optional[int] = Field(None, ge=1, le=20)
    doc_ids:       Optional[List[str]] = None   # replace linked docs (None = no change)


class CreateAgentRequest(BaseModel):
    """Fields required to create a new custom agent."""
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
    doc_ids:       List[str] = []   # ChromaDB doc IDs to link to this agent


class AgentOut(BaseModel):
    id:            str
    slug:          str
    name:          str
    description:   str
    agent_type:    str
    icon:          str
    is_builtin:    bool
    active:        bool
    system_prompt: str
    temperature:   float
    max_tokens:    int
    rag_enabled:   bool
    rag_doc_types: List[str]
    rag_top_k:     int
    keywords:      List[str]
    doc_ids:       List[str]
    # base_prompt intentionally NOT exposed here — org can't see it


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_agent_for_org(
    agent_id: UUID,
    org: Organization,
    db: AsyncSession,
) -> AgentDefinition:
    result = await db.execute(
        select(AgentDefinition).where(
            AgentDefinition.id == agent_id,
            AgentDefinition.org_id == org.id,
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return agent


def _agent_out(agent: AgentDefinition) -> AgentOut:
    return AgentOut(
        id=str(agent.id),
        slug=agent.slug,
        name=agent.name,
        description=agent.description or "",
        agent_type=agent.agent_type,
        icon=agent.icon or "🤖",
        is_builtin=agent.is_builtin,
        active=agent.active,
        system_prompt=agent.system_prompt or "",
        temperature=agent.temperature,
        max_tokens=agent.max_tokens,
        rag_enabled=agent.rag_enabled,
        rag_doc_types=agent.rag_doc_types_list,
        rag_top_k=agent.rag_top_k,
        keywords=agent.keywords_list,
        doc_ids=[lnk.doc_id for lnk in agent.doc_links] if agent.doc_links else [],
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[AgentOut])
async def list_org_agents(
    org: Organization = Depends(current_brand),
    db: AsyncSession = Depends(get_db),
):
    """List all agents for the authenticated org.
    Built-in agents are only returned when platform_enabled=True (super-admin control).
    """
    from sqlalchemy import or_
    result = await db.execute(
        select(AgentDefinition)
        .where(
            AgentDefinition.org_id == org.id,
            or_(
                AgentDefinition.is_builtin == False,
                AgentDefinition.platform_enabled == True,
            ),
        )
        .order_by(AgentDefinition.created_at)
    )
    agents = result.scalars().all()
    return [_agent_out(a) for a in agents]


@router.get("/{agent_id}", response_model=AgentOut)
async def get_org_agent(
    agent_id: UUID,
    org: Organization = Depends(current_brand),
    db: AsyncSession = Depends(get_db),
):
    """Get a single agent for the authenticated org."""
    agent = await _get_agent_for_org(agent_id, org, db)
    return _agent_out(agent)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_org_agent(
    agent_id: UUID,
    req: AgentUpdateRequest,
    org: Organization = Depends(current_brand),
    db: AsyncSession = Depends(get_db),
):
    """
    Update org-editable fields on an agent.
    - system_prompt, temperature, max_tokens, active, keywords
    - base_prompt is NOT editable here — super admin only
    """
    agent = await _get_agent_for_org(agent_id, org, db)

    if req.system_prompt is not None:
        agent.system_prompt = req.system_prompt
    if req.temperature is not None:
        agent.temperature = req.temperature
    if req.max_tokens is not None:
        agent.max_tokens = req.max_tokens
    if req.active is not None:
        if agent.slug == "triage" and req.active is False:
            raise HTTPException(status_code=400, detail="Triage agent cannot be deactivated.")
        agent.active = req.active
    if req.keywords is not None:
        agent.keywords_json = json.dumps(req.keywords)
    if req.rag_enabled is not None:
        agent.rag_enabled = req.rag_enabled
    if req.rag_doc_types is not None:
        agent.rag_doc_types = ",".join(req.rag_doc_types)
    if req.rag_top_k is not None:
        agent.rag_top_k = req.rag_top_k
    if req.doc_ids is not None:
        # Replace all doc links for this agent
        await db.execute(
            delete(AgentDocLink).where(AgentDocLink.agent_id == agent.id)
        )
        for doc_id in set(req.doc_ids):
            db.add(AgentDocLink(agent_id=agent.id, doc_id=doc_id))

    await db.commit()
    await db.refresh(agent)

    logger.info("org_agent.updated", org_id=str(org.id), agent_id=str(agent_id))
    return _agent_out(agent)


@router.post("", response_model=AgentOut, status_code=201)
async def create_org_agent(
    req: CreateAgentRequest,
    org: Organization = Depends(current_brand),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom agent scoped to the authenticated org."""
    # Auto-generate slug from name; ensure uniqueness within org
    base_slug = re.sub(r"[^a-z0-9_]", "_", req.name.lower().strip())[:40].strip("_")
    slug = base_slug
    i = 1
    while True:
        existing = await db.execute(
            select(AgentDefinition).where(
                AgentDefinition.org_id == org.id,
                AgentDefinition.slug == slug,
            )
        )
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}_{i}"
        i += 1

    agent = AgentDefinition(
        org_id=org.id,
        slug=slug,
        name=req.name,
        description=req.description,
        agent_type="custom",
        icon=req.icon,
        is_builtin=False,
        active=True,
        system_prompt=req.system_prompt,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        rag_enabled=req.rag_enabled,
        rag_doc_types=",".join(req.rag_doc_types),
        rag_top_k=req.rag_top_k,
        keywords_json=json.dumps(req.keywords),
        skills_json="[]",
    )
    db.add(agent)
    await db.flush()  # get agent.id before linking docs

    for doc_id in set(req.doc_ids):
        db.add(AgentDocLink(agent_id=agent.id, doc_id=doc_id))

    await db.commit()
    await db.refresh(agent)
    logger.info("org_agent.created", org_id=str(org.id), slug=slug,
                doc_ids=req.doc_ids)
    return _agent_out(agent)


# ── Knowledge base chunks ─────────────────────────────────────────────────────

# Note: org_agents router has prefix /org/agents — KB chunks live at a separate path.
# We add a separate router here mounted at /org/kb.

kb_router = APIRouter(prefix="/org/kb", tags=["Org Knowledge Base"])


@kb_router.get("/{doc_id}/chunks")
async def get_org_doc_chunks(
    doc_id: str,
    org: Organization = Depends(current_brand),
):
    """Return all chunks for a specific doc belonging to the authenticated org."""
    store = get_vector_store()
    chunks = store.get_doc_chunks(client_id=str(org.id), doc_id=doc_id)
    return {"doc_id": doc_id, "org_slug": org.slug, "chunks": chunks, "total": len(chunks)}

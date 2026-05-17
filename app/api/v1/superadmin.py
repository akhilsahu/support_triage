"""
Super Admin API — platform-owner only endpoints.
Auth: X-Super-Admin-Key header must match SUPER_ADMIN_KEY env var.
"""

from __future__ import annotations

import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.models.org import Organization
from app.rag.vector_store import get_vector_store
from app.api.db_utils import (
    platform_stats, list_orgs, get_org_by_id,
    list_agents_with_org, list_skills, count_agents, count_messages,
    count_skills, set_org_active, set_org_plan, list_logs,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/super-admin", tags=["Super Admin"])

SUPER_ADMIN_KEY = settings.SUPER_ADMIN_KEY


# ── Auth dependency ───────────────────────────────────────────────────────────

async def require_super_admin(x_super_admin_key: Optional[str] = Header(None)):
    if not x_super_admin_key or x_super_admin_key != SUPER_ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing super admin key.")


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", dependencies=[Depends(require_super_admin)])
async def stats_endpoint(db: AsyncSession = Depends(get_db)):
    return await platform_stats(db)


# ── Organizations ─────────────────────────────────────────────────────────────

@router.get("/orgs", dependencies=[Depends(require_super_admin)])
async def list_orgs_endpoint(
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    orgs, total = await list_orgs(db, search=search, plan=plan, active=active, limit=limit, offset=offset)

    result = []
    for org in orgs:
        d = org.to_dict()
        d["agent_count"]   = await count_agents(db, org.id)
        d["active_agents"] = await count_agents(db, org.id, active_only=True)
        d["message_count"] = await count_messages(db, org.id)
        d["skill_count"]   = await count_skills(db, org.id)
        result.append(d)

    return {"orgs": result, "total": total}


@router.get("/orgs/{org_id}", dependencies=[Depends(require_super_admin)])
async def get_org_endpoint(org_id: str, db: AsyncSession = Depends(get_db)):
    org = await get_org_by_id(db, uuid.UUID(org_id))
    if not org:
        raise HTTPException(404, "Organization not found.")

    agents = await list_agents_with_org(db, org_id=org.id)
    skills = await list_skills(db, org.id)

    store = get_vector_store()
    kb_docs = store.get_client_docs(str(org.id))

    return {
        "org":     org.to_dict(),
        "agents":  [{**a.to_dict(), "org_slug": slug, "org_name": name} for a, slug, name in agents],
        "skills":  [s.to_dict() for s in skills],
        "kb_docs": kb_docs,
    }


class OrgPatchRequest(BaseModel):
    active: Optional[bool] = None
    plan: Optional[str] = None


@router.patch("/orgs/{org_id}", dependencies=[Depends(require_super_admin)])
async def patch_org_endpoint(org_id: str, req: OrgPatchRequest, db: AsyncSession = Depends(get_db)):
    org = await get_org_by_id(db, uuid.UUID(org_id))
    if not org:
        raise HTTPException(404, "Organization not found.")

    if req.active is not None:
        org = await set_org_active(db, org, req.active)
    if req.plan is not None:
        org = await set_org_plan(db, org, req.plan)

    return org.to_dict()


# ── Activity ──────────────────────────────────────────────────────────────────

@router.get("/activity", dependencies=[Depends(require_super_admin)])
async def activity_endpoint(
    org_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    oid = uuid.UUID(org_id) if org_id else None
    rows = await list_logs(db, org_id=oid, limit=limit, offset=offset)
    total = await count_messages(db)

    logs = [
        {
            "id":          str(log.id),
            "org_slug":    slug,
            "org_name":    name,
            "session_id":  log.session_id,
            "role":        log.role,
            "message":     log.message[:200] + ("…" if len(log.message) > 200 else ""),
            "intent":      log.intent,
            "agent_slug":  log.agent_slug,
            "rag_hit":     log.rag_hit,
            "response_ms": log.response_ms,
            "timestamp":   log.timestamp.isoformat(),
        }
        for log, slug, name in rows
    ]
    return {"logs": logs, "total": total}


# ── Vector DB ────────────────────────────────────────────────────────────────

@router.get("/vectordb", dependencies=[Depends(require_super_admin)])
async def vectordb_endpoint():
    store = get_vector_store()
    summary = store.stats()

    # Per-org breakdown from client_documents
    from app.rag.vector_store import COLLECTION_CLIENT
    col = store._collection(COLLECTION_CLIENT)
    all_meta = col.get(include=["metadatas"]).get("metadatas", []) if col.count() > 0 else []

    # Deduplicate by doc_id per org
    orgs: dict = {}
    for meta in all_meta:
        cid = meta.get("client_id", "unknown")
        did = meta.get("doc_id", "")
        if cid not in orgs:
            orgs[cid] = {"client_id": cid, "org_name": meta.get("org_name", ""), "docs": {}}
        if did and did not in orgs[cid]["docs"]:
            orgs[cid]["docs"][did] = {
                "doc_id":      did,
                "doc_name":    meta.get("doc_name", meta.get("filename", "")),
                "doc_type":    meta.get("doc_type", "general"),
                "kb_name":     meta.get("kb_name", ""),
                "uploaded_at": meta.get("uploaded_at", ""),
                "expires_at":  meta.get("expires_at", ""),
                "chunk_count": 0,
            }
        if did:
            orgs[cid]["docs"][did]["chunk_count"] += 1

    org_list = []
    for cid, data in orgs.items():
        org_list.append({
            "client_id": cid,
            "org_name":  data["org_name"],
            "doc_count": len(data["docs"]),
            "chunk_count": sum(d["chunk_count"] for d in data["docs"].values()),
            "docs": list(data["docs"].values()),
        })

    return {
        "summary": summary,
        "orgs": org_list,
    }


@router.get("/vectordb/{client_id}/{doc_id}/chunks", dependencies=[Depends(require_super_admin)])
async def vectordb_doc_chunks(client_id: str, doc_id: str):
    """Return all chunks for a specific document."""
    store = get_vector_store()
    chunks = store.get_doc_chunks(client_id, doc_id)
    return {"client_id": client_id, "doc_id": doc_id, "chunks": chunks, "total": len(chunks)}


@router.delete("/vectordb/{client_id}/{doc_id}", dependencies=[Depends(require_super_admin)])
async def vectordb_delete_doc(client_id: str, doc_id: str):
    store = get_vector_store()
    deleted = store.delete_client_doc(client_id, doc_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Document not found in vector DB.")
    return {"deleted_chunks": deleted, "doc_id": doc_id, "client_id": client_id}


# ── Agents ────────────────────────────────────────────────────────────────────

@router.get("/agents", dependencies=[Depends(require_super_admin)])
async def agents_endpoint(
    org_id: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    oid = uuid.UUID(org_id) if org_id else None
    rows = await list_agents_with_org(db, org_id=oid, active=active)
    return {
        "agents": [
            {**a.to_dict(include_base_prompt=True), "org_slug": slug, "org_name": name}
            for a, slug, name in rows
        ]
    }


class BuiltinAgentToggleRequest(BaseModel):
    platform_enabled: bool


@router.get("/builtin-agents", dependencies=[Depends(require_super_admin)])
async def list_builtin_agent_types(db: AsyncSession = Depends(get_db)):
    """
    Return distinct built-in agent types and their platform_enabled status.
    One row per agent_type — enabled status is consistent across all orgs.
    """
    from sqlalchemy import select as sa_select, distinct
    from app.models.org import AgentDefinition

    result = await db.execute(
        sa_select(
            AgentDefinition.agent_type,
            AgentDefinition.name,
            AgentDefinition.icon,
            AgentDefinition.slug,
            AgentDefinition.platform_enabled,
        )
        .where(AgentDefinition.is_builtin == True)
        .distinct(AgentDefinition.agent_type)
        .order_by(AgentDefinition.agent_type, AgentDefinition.platform_enabled)
    )
    rows = result.all()

    # Deduplicate by agent_type — use the first row per type
    seen: dict = {}
    for row in rows:
        if row.agent_type not in seen:
            seen[row.agent_type] = {
                "agent_type":       row.agent_type,
                "name":             row.name,
                "icon":             row.icon,
                "slug":             row.slug,
                "platform_enabled": row.platform_enabled,
            }

    return {"builtin_agents": list(seen.values())}


@router.patch("/builtin-agents/{agent_type}", dependencies=[Depends(require_super_admin)])
async def toggle_builtin_agent_type(
    agent_type: str,
    req: BuiltinAgentToggleRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Enable or disable a built-in agent type across ALL organisations.
    Sets platform_enabled on every AgentDefinition row with matching agent_type.
    """
    from sqlalchemy import update as sa_update
    from app.models.org import AgentDefinition

    result = await db.execute(
        sa_update(AgentDefinition)
        .where(
            AgentDefinition.agent_type == agent_type,
            AgentDefinition.is_builtin == True,
        )
        .values(platform_enabled=req.platform_enabled)
        .returning(AgentDefinition.id)
    )
    updated_ids = result.fetchall()
    await db.commit()

    logger.info(
        "super_admin.builtin_agent_toggled",
        agent_type=agent_type,
        platform_enabled=req.platform_enabled,
        rows_updated=len(updated_ids),
    )
    return {
        "agent_type":       agent_type,
        "platform_enabled": req.platform_enabled,
        "rows_updated":     len(updated_ids),
    }


class AgentPatchRequest(BaseModel):
    active: Optional[bool] = None


@router.patch("/agents/{agent_id}", dependencies=[Depends(require_super_admin)])
async def patch_agent(
    agent_id: str,
    req: AgentPatchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable any agent (per-org) from the super admin panel."""
    from sqlalchemy import select as sa_select
    from app.models.org import AgentDefinition

    result = await db.execute(
        sa_select(AgentDefinition).where(AgentDefinition.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found.")

    if req.active is not None:
        if agent.slug == "triage" and req.active is False:
            raise HTTPException(400, "Triage agent cannot be deactivated.")
        agent.active = req.active

    await db.commit()
    await db.refresh(agent)
    logger.info("super_admin.agent_patched", agent_id=agent_id, active=req.active)
    return {**agent.to_dict(), "updated": True}


class BasePatchRequest(BaseModel):
    base_prompt: str


@router.patch("/agents/{agent_id}/base-prompt", dependencies=[Depends(require_super_admin)])
async def patch_agent_base_prompt(
    agent_id: str,
    req: BasePatchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update the hidden guardrail base_prompt for a specific agent (platform admin only)."""
    from sqlalchemy import select as sa_select
    from app.models.org import AgentDefinition

    result = await db.execute(
        sa_select(AgentDefinition).where(AgentDefinition.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found.")

    agent.base_prompt = req.base_prompt
    await db.commit()
    await db.refresh(agent)

    logger.info("super_admin.base_prompt_updated", agent_id=agent_id, slug=agent.slug)
    return {
        "id":          str(agent.id),
        "slug":        agent.slug,
        "agent_type":  agent.agent_type,
        "base_prompt": agent.base_prompt,
        "updated":     True,
    }

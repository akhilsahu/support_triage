"""
Super Admin API — platform-owner only endpoints.
Auth: X-Super-Admin-Key header must match SUPER_ADMIN_KEY env var.
"""

from __future__ import annotations

import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.models.space import Space
from app.services.datasource.availability import datasource_feature_enabled
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


@router.get("/orgs/{space_id}", dependencies=[Depends(require_super_admin)])
async def get_org_endpoint(space_id: str, db: AsyncSession = Depends(get_db)):
    org = await get_org_by_id(db, uuid.UUID(space_id))
    if not org:
        raise HTTPException(404, "Space not found.")

    agents = await list_agents_with_org(db, space_id=org.id)
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
    # Per-space chatbot cap. Send an int to override, or explicit null to inherit
    # the global default. "Field present" is detected via model_fields_set so that
    # omitting it leaves the current value untouched.
    max_chatbots: Optional[int] = None


@router.patch("/orgs/{space_id}", dependencies=[Depends(require_super_admin)])
async def patch_org_endpoint(space_id: str, req: OrgPatchRequest, db: AsyncSession = Depends(get_db)):
    org = await get_org_by_id(db, uuid.UUID(space_id))
    if not org:
        raise HTTPException(404, "Space not found.")

    if req.active is not None:
        org = await set_org_active(db, org, req.active)
    if req.plan is not None:
        org = await set_org_plan(db, org, req.plan)
    if "max_chatbots" in req.model_fields_set:
        org.max_chatbots = req.max_chatbots   # may be None → inherit global
        await db.commit()
        await db.refresh(org)

    return org.to_dict()


# ── Activity ──────────────────────────────────────────────────────────────────

@router.get("/activity", dependencies=[Depends(require_super_admin)])
async def activity_endpoint(
    space_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    oid = uuid.UUID(space_id) if space_id else None
    rows = await list_logs(db, space_id=oid, limit=limit, offset=offset)
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

    space_list = []
    for cid, data in orgs.items():
        space_list.append({
            "client_id": cid,
            "space_name": data["org_name"],
            "doc_count": len(data["docs"]),
            "chunk_count": sum(d["chunk_count"] for d in data["docs"].values()),
            "docs": list(data["docs"].values()),
        })

    return {
        "summary": summary,
        "spaces": space_list,
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
    space_id: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    oid = uuid.UUID(space_id) if space_id else None
    rows = await list_agents_with_org(db, space_id=oid, active=active)
    return {
        "agents": [
            {**a.to_dict(), "org_slug": slug, "org_name": name}
            for a, slug, name in rows
        ]
    }


class BuiltinAgentToggleRequest(BaseModel):
    platform_enabled: bool


@router.get("/builtin-agents", dependencies=[Depends(require_super_admin)])
async def list_builtin_agent_types(db: AsyncSession = Depends(get_db)):
    """Return all entries in builtin_agent_catalog with their platform_enabled status."""
    from sqlalchemy import select as sa_select
    from app.models.space import BuiltinAgentCatalog

    result = await db.execute(
        sa_select(BuiltinAgentCatalog).order_by(BuiltinAgentCatalog.agent_type)
    )
    catalog = result.scalars().all()
    return {
        "builtin_agents": [
            {
                "agent_type":       c.agent_type,
                "name":             c.name,
                "icon":             c.icon,
                "slug":             c.slug,
                "platform_enabled": c.platform_enabled,
                "locked":           c.locked,
            }
            for c in catalog
        ]
    }


@router.patch("/builtin-agents/{agent_type}", dependencies=[Depends(require_super_admin)])
async def toggle_builtin_agent_type(
    agent_type: str,
    req: BuiltinAgentToggleRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Enable or disable a built-in agent type globally (Factor 1).
    Updates one row in builtin_agent_catalog — affects all orgs immediately.
    """
    from sqlalchemy import select as sa_select
    from app.models.space import BuiltinAgentCatalog

    result = await db.execute(
        sa_select(BuiltinAgentCatalog).where(BuiltinAgentCatalog.agent_type == agent_type)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, f"Built-in agent type '{agent_type}' not found.")
    if cat.locked and not req.platform_enabled:
        raise HTTPException(400, f"'{cat.name}' is locked and cannot be disabled.")

    cat.platform_enabled = req.platform_enabled
    await db.commit()

    logger.info("super_admin.builtin_catalog_toggled", agent_type=agent_type,
                platform_enabled=req.platform_enabled)
    return {
        "agent_type":       agent_type,
        "platform_enabled": req.platform_enabled,
    }


class AgentPatchRequest(BaseModel):
    active: Optional[bool] = None


@router.patch("/agents/{agent_id}", dependencies=[Depends(require_super_admin)])
async def patch_agent(
    agent_id: str,
    req: AgentPatchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable a custom agent from the super admin panel."""
    from sqlalchemy import select as sa_select
    from app.models.space import CustomAgent

    result = await db.execute(
        sa_select(CustomAgent).where(CustomAgent.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found.")

    if req.active is not None:
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
    """Update base_prompt on a BuiltinAgentCatalog entry (platform admin only)."""
    from sqlalchemy import select as sa_select
    from app.models.space import BuiltinAgentCatalog

    result = await db.execute(
        sa_select(BuiltinAgentCatalog).where(BuiltinAgentCatalog.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Builtin agent not found.")

    agent.base_prompt = req.base_prompt
    await db.commit()
    await db.refresh(agent)

    logger.info("super_admin.base_prompt_updated", agent_id=agent_id, slug=agent.slug)
    return {
        "id":          str(agent.id),
        "slug":        agent.slug,
        "base_prompt": agent.base_prompt,
        "updated":     True,
    }


# ── Nav Config ────────────────────────────────────────────────────────────────

async def _get_or_create_platform_settings(db: AsyncSession):
    from sqlalchemy import select as sa_select
    from app.models.space import PlatformSettings, ALL_NAV_ITEMS
    result = await db.execute(sa_select(PlatformSettings).limit(1))
    row = result.scalar_one_or_none()
    if not row:
        import json
        row = PlatformSettings(nav_config=json.dumps({k: True for k in ALL_NAV_ITEMS}))
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


class NavConfigRequest(BaseModel):
    nav_config: dict   # { nav_item_id: bool }


class DataSourcesPlatformRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    platform_enabled: StrictBool


class DataSourcesSpaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    override: StrictBool | None = None


@router.get("/data-sources-feature", dependencies=[Depends(require_super_admin)])
async def get_data_sources_feature(db: AsyncSession = Depends(get_db)):
    """Return the platform-wide Data Sources master switch."""
    ps = await _get_or_create_platform_settings(db)
    return {"platform_enabled": ps.datasources_platform_enabled}


@router.patch("/data-sources-feature", dependencies=[Depends(require_super_admin)])
async def patch_data_sources_feature(
    req: DataSourcesPlatformRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set the platform-wide Data Sources master switch."""
    ps = await _get_or_create_platform_settings(db)
    ps.datasources_platform_enabled = req.platform_enabled
    await db.commit()
    return {"platform_enabled": ps.datasources_platform_enabled}


@router.get(
    "/spaces/{space_id}/data-sources-feature",
    dependencies=[Depends(require_super_admin)],
)
async def get_space_data_sources_feature(
    space_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return a space's nullable override and effective Data Sources state."""
    org = await get_org_by_id(db, space_id)
    if not org:
        raise HTTPException(404, "Space not found.")
    return {
        "override": org.datasources_enabled,
        "effective_enabled": await datasource_feature_enabled(db, org),
    }


@router.patch(
    "/spaces/{space_id}/data-sources-feature",
    dependencies=[Depends(require_super_admin)],
)
async def patch_space_data_sources_feature(
    space_id: uuid.UUID,
    req: DataSourcesSpaceRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set a space override directly; null restores platform inheritance."""
    org = await get_org_by_id(db, space_id)
    if not org:
        raise HTTPException(404, "Space not found.")
    org.datasources_enabled = req.override
    await db.commit()
    return {
        "override": org.datasources_enabled,
        "effective_enabled": await datasource_feature_enabled(db, org),
    }


@router.get("/nav", dependencies=[Depends(require_super_admin)])
async def get_system_nav(db: AsyncSession = Depends(get_db)):
    """Get system-wide nav item enable/disable config."""
    ps = await _get_or_create_platform_settings(db)
    return {"nav_config": ps.get_nav_config()}


@router.patch("/nav", dependencies=[Depends(require_super_admin)])
async def patch_system_nav(req: NavConfigRequest, db: AsyncSession = Depends(get_db)):
    """Update system-wide nav config. Merges into existing config."""
    import json
    ps = await _get_or_create_platform_settings(db)
    current = ps.get_nav_config()
    current.update(req.nav_config)
    ps.nav_config = json.dumps(current)
    await db.commit()
    return {"nav_config": ps.get_nav_config()}


class ChatbotLimitRequest(BaseModel):
    default_max_chatbots: int   # 1 = single (multi off), N = up to N, -1 = unlimited


@router.get("/chatbot-limits", dependencies=[Depends(require_super_admin)])
async def get_chatbot_limits(db: AsyncSession = Depends(get_db)):
    """Global default chatbot cap applied to every space that has no override."""
    ps = await _get_or_create_platform_settings(db)
    return {"default_max_chatbots": ps.default_max_chatbots}


@router.patch("/chatbot-limits", dependencies=[Depends(require_super_admin)])
async def patch_chatbot_limits(req: ChatbotLimitRequest, db: AsyncSession = Depends(get_db)):
    """Set the global default chatbot cap (the 'for all' control)."""
    ps = await _get_or_create_platform_settings(db)
    ps.default_max_chatbots = req.default_max_chatbots
    await db.commit()
    return {"default_max_chatbots": ps.default_max_chatbots}


@router.get("/spaces/{space_id}/nav", dependencies=[Depends(require_super_admin)])
async def get_space_nav(space_id: str, db: AsyncSession = Depends(get_db)):
    """Get per-space nav override (null = inherits system defaults)."""
    import json
    org = await get_org_by_id(db, uuid.UUID(space_id))
    if not org:
        raise HTTPException(404, "Space not found.")
    space_nav = json.loads(org.enabled_nav_items) if org.enabled_nav_items else None
    return {"space_id": space_id, "enabled_nav_items": space_nav}


class SpaceNavRequest(BaseModel):
    enabled_nav_items: Optional[list] = None   # null = reset to system defaults


@router.patch("/spaces/{space_id}/nav", dependencies=[Depends(require_super_admin)])
async def patch_space_nav(
    space_id: str,
    req: SpaceNavRequest,
    db: AsyncSession = Depends(get_db),
):
    """Override nav items for a specific space. Pass null to reset to system defaults."""
    import json
    org = await get_org_by_id(db, uuid.UUID(space_id))
    if not org:
        raise HTTPException(404, "Space not found.")
    org.enabled_nav_items = json.dumps(req.enabled_nav_items) if req.enabled_nav_items is not None else None
    await db.commit()
    return {"space_id": space_id, "enabled_nav_items": req.enabled_nav_items}


# ── Global Settings / Homepage ───────────────────────────────────────────────

@router.get("/settings/public")
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Publicly accessible platform settings (e.g. active homepage)."""
    ps = await _get_or_create_platform_settings(db)
    return {
        "active_homepage": ps.active_homepage or "homepage1",
        # Read by ChatbotProfile (space-owner, not super-admin auth) to decide
        # whether its own per-bot toggle should be enabled -- Factor 1 of the
        # two-factor gate, see PlatformSettings.homepage_sections_platform_enabled.
        "homepage_sections_platform_enabled": ps.homepage_sections_platform_enabled,
        # Read by the customer chat page to render the "Continue with Google"
        # button. Empty string = Google sign-in isn't configured on this server,
        # so the frontend leaves the chat open instead of showing a dead button.
        "google_client_id": settings.GOOGLE_CLIENT_ID,
    }


class HomepageSectionsPlatformRequest(BaseModel):
    homepage_sections_platform_enabled: bool


@router.get("/homepage-sections", dependencies=[Depends(require_super_admin)])
async def get_homepage_sections_platform_setting(db: AsyncSession = Depends(get_db)):
    """Factor 1 (platform-level) master switch for the AI homepage-sections renderengine."""
    ps = await _get_or_create_platform_settings(db)
    return {"homepage_sections_platform_enabled": ps.homepage_sections_platform_enabled}


@router.patch("/homepage-sections", dependencies=[Depends(require_super_admin)])
async def patch_homepage_sections_platform_setting(
    req: HomepageSectionsPlatformRequest, db: AsyncSession = Depends(get_db)
):
    """
    Enable/disable the AI homepage-sections feature platform-wide.

    This does not touch any individual chatbot's own homepage_sections_enabled
    (Factor 2) -- spaces can still save their own preference regardless, it
    just has no effect until this is also True. Mirrors the existing
    BuiltinAgentCatalog.platform_enabled + SpaceBuiltinAgentConfig.enabled pattern.
    """
    ps = await _get_or_create_platform_settings(db)
    ps.homepage_sections_platform_enabled = req.homepage_sections_platform_enabled
    await db.commit()
    return {"homepage_sections_platform_enabled": ps.homepage_sections_platform_enabled}


class PlatformSettingsPatchRequest(BaseModel):
    active_homepage: str


@router.patch("/settings", dependencies=[Depends(require_super_admin)])
async def patch_platform_settings(req: PlatformSettingsPatchRequest, db: AsyncSession = Depends(get_db)):
    """Update system-wide platform settings (e.g. active homepage)."""
    if req.active_homepage not in settings.AVAILABLE_HOMEPAGES:
        raise HTTPException(status_code=400, detail="Invalid homepage name.")
    ps = await _get_or_create_platform_settings(db)
    ps.active_homepage = req.active_homepage
    await db.commit()
    return {"active_homepage": ps.active_homepage}

"""
Chatbot management endpoints (JWT-protected, space-scoped).

POST   /chatbots                  — create a new chatbot
GET    /chatbots                  — list space's chatbots
GET    /chatbots/{chatbot_slug}   — get chatbot details
PATCH  /chatbots/{chatbot_slug}   — update chatbot
DELETE /chatbots/{chatbot_slug}   — delete chatbot (cannot delete the default)
POST   /chatbots/{chatbot_slug}/set-default — make this the default chatbot
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.auth import current_space
from app.core.database import get_db
from app.models.chatbot import Chatbot
from app.models.space import Space

logger = structlog.get_logger()
router = APIRouter(prefix="/chatbots", tags=["Chatbots"])

# ── Logo upload ─────────────────────────────────────────────────────────────
LOGO_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "svg"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatbotCreate(BaseModel):
    slug: str
    display_name: str
    description: Optional[str] = ""
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None


class ChatbotUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    theme_color: Optional[str] = None
    show_logo: Optional[bool] = None
    active: Optional[bool] = None
    human_transfer_enabled: Optional[bool] = None
    human_transfer_message: Optional[str] = None
    homepage_sections_enabled: Optional[bool] = None
    homepage_sections_override: Optional[str] = None
    quick_topics: Optional[str] = None
    trust_badges: Optional[str] = None


class ChatbotOut(BaseModel):
    id: str
    space_id: str
    api_key: Optional[str]
    slug: str
    display_name: str
    description: str
    logo_url: Optional[str]
    theme_color: Optional[str]
    show_logo: bool
    is_default: bool
    active: bool
    homepage_sections_enabled: bool = False
    homepage_sections_override: Optional[str] = None
    quick_topics: Optional[str] = None
    trust_badges: Optional[str] = None
    created_at: Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_chatbot(chatbot_slug: str, space_id: UUID, db: AsyncSession) -> Chatbot:
    result = await db.execute(
        select(Chatbot).where(
            Chatbot.slug == chatbot_slug,
            Chatbot.space_id == space_id,
        )
    )
    chatbot = result.scalar_one_or_none()
    if not chatbot:
        raise HTTPException(404, f"Chatbot '{chatbot_slug}' not found.")
    return chatbot


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ChatbotOut])
async def list_chatbots(
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """List all chatbots for the authenticated space."""
    result = await db.execute(
        select(Chatbot)
        .where(Chatbot.space_id == space.id)
        .order_by(Chatbot.is_default.desc(), Chatbot.created_at)
    )
    chatbots = result.scalars().all()
    return [ChatbotOut(**c.to_dict()) for c in chatbots]


@router.get("/quota")
async def get_chatbot_quota(
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Current chatbot count vs the space's effective limit — drives UI gating."""
    from app.utils.chatbot_limits import chatbot_quota
    return await chatbot_quota(db, space)


@router.post("", response_model=ChatbotOut, status_code=201)
async def create_chatbot(
    req: ChatbotCreate,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Create a new chatbot for the space."""
    # Enforce the space's chatbot cap (per-space override or platform default).
    from app.utils.chatbot_limits import chatbot_quota
    quota = await chatbot_quota(db, space)
    if not quota["can_create"]:
        raise HTTPException(
            403,
            f"Chatbot limit reached ({quota['limit']}). "
            "Contact your administrator to raise it.",
        )

    # Check slug uniqueness within space
    existing = await db.execute(
        select(Chatbot).where(Chatbot.space_id == space.id, Chatbot.slug == req.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Chatbot slug '{req.slug}' already exists.")

    import uuid as _uuid
    chatbot = Chatbot(
        space_id=space.id,
        slug=req.slug,
        display_name=req.display_name,
        description=req.description or "",
        logo_url=req.logo_url,
        theme_color=req.theme_color,
        is_default=False,
        active=True,
        api_key=str(_uuid.uuid4()),
    )
    db.add(chatbot)
    await db.flush()   # assign chatbot.id before seeding agents
    await _seed_new_chatbot_agents(db, space.id, chatbot.id)
    await db.commit()
    await db.refresh(chatbot)
    return ChatbotOut(**chatbot.to_dict())


async def _seed_new_chatbot_agents(db: AsyncSession, space_id: UUID, new_chatbot_id: UUID) -> None:
    """
    Seed a freshly created chatbot the same way a space's very first (default)
    chatbot is seeded at registration (see _seed_org_builtin_configs in auth.py):
    only LOCKED builtins (triage — required for routing) get an enabled config
    row. Every other agent — builtin or custom — is opt-in and must be
    explicitly created/enabled by the owner for this specific chatbot.

    Deliberately does NOT copy the default chatbot's custom agents: a cloned
    agent still carries the original's name/branding/content verbatim, which is
    actively wrong for a chatbot built for a different purpose (e.g. a credit
    card bot inheriting a life-insurance agent). Each chatbot gets its own
    agents, created on purpose, not inherited.
    """
    from app.models.space import BuiltinAgentCatalog, SpaceBuiltinAgentConfig

    locked_catalog = (await db.execute(
        select(BuiltinAgentCatalog).where(BuiltinAgentCatalog.locked == True)
    )).scalars().all()
    for cat_row in locked_catalog:
        db.add(SpaceBuiltinAgentConfig(
            space_id=space_id, chatbot_id=new_chatbot_id, catalog_id=cat_row.id,
            enabled=True,
        ))


@router.get("/{chatbot_slug}", response_model=ChatbotOut)
async def get_chatbot(
    chatbot_slug: str,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    chatbot = await _get_chatbot(chatbot_slug, space.id, db)
    return ChatbotOut(**chatbot.to_dict())


@router.patch("/{chatbot_slug}", response_model=ChatbotOut)
async def update_chatbot(
    chatbot_slug: str,
    req: ChatbotUpdate,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    chatbot = await _get_chatbot(chatbot_slug, space.id, db)

    if req.display_name is not None:
        chatbot.display_name = req.display_name
    if req.description is not None:
        chatbot.description = req.description
    if req.logo_url is not None:
        chatbot.logo_url = req.logo_url
    if req.theme_color is not None:
        chatbot.theme_color = req.theme_color
    if req.show_logo is not None:
        chatbot.show_logo = req.show_logo
    if req.active is not None:
        if chatbot.is_default and req.active is False:
            # The default chatbot is what /{space_slug} resolves to (see
            # _get_brand in customer.py); deactivating it would 503 the org's
            # main customer-facing URL entirely.
            raise HTTPException(400, "Cannot deactivate the default chatbot.")
        chatbot.active = req.active
    if req.human_transfer_enabled is not None:
        chatbot.human_transfer_enabled = req.human_transfer_enabled
    if req.human_transfer_message is not None:
        chatbot.human_transfer_message = req.human_transfer_message
    if req.homepage_sections_enabled is not None:
        chatbot.homepage_sections_enabled = req.homepage_sections_enabled
    if req.homepage_sections_override is not None:
        from app.renderengine.homepage_sections import validate_override_payload
        try:
            chatbot.homepage_sections_override = validate_override_payload(req.homepage_sections_override)
        except ValueError as e:
            raise HTTPException(400, str(e))
    if req.quick_topics is not None:
        from app.renderengine.quick_topics import validate_quick_topics_payload
        try:
            chatbot.quick_topics = validate_quick_topics_payload(req.quick_topics)
        except ValueError as e:
            raise HTTPException(400, str(e))
    if req.trust_badges is not None:
        from app.renderengine.trust_badges import validate_trust_badges_payload
        try:
            chatbot.trust_badges = validate_trust_badges_payload(req.trust_badges)
        except ValueError as e:
            raise HTTPException(400, str(e))

    await db.commit()
    await db.refresh(chatbot)
    return chatbot.to_dict()


@router.delete("/{chatbot_slug}", status_code=204)
async def delete_chatbot(
    chatbot_slug: str,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    chatbot = await _get_chatbot(chatbot_slug, space.id, db)
    if chatbot.is_default:
        raise HTTPException(400, "Cannot delete the default chatbot.")
    await db.delete(chatbot)
    await db.commit()


@router.post("/{chatbot_slug}/set-default", response_model=ChatbotOut)
async def set_default_chatbot(
    chatbot_slug: str,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Make this chatbot the default for /{slug} routing."""
    # Unset current default
    result = await db.execute(
        select(Chatbot).where(Chatbot.space_id == space.id, Chatbot.is_default == True)
    )
    current_default = result.scalar_one_or_none()
    if current_default:
        current_default.is_default = False

    # Set new default
    chatbot = await _get_chatbot(chatbot_slug, space.id, db)
    chatbot.is_default = True

    await db.commit()
    await db.refresh(chatbot)
    return ChatbotOut(**chatbot.to_dict())


@router.post("/{chatbot_slug}/logo", response_model=ChatbotOut)
async def upload_chatbot_logo(
    chatbot_slug: str,
    file: UploadFile = File(...),
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Upload/replace this chatbot's logo. Stored on local disk, served under /uploads."""
    chatbot = await _get_chatbot(chatbot_slug, space.id, db)

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in LOGO_EXTENSIONS:
        raise HTTPException(
            400, f"Unsupported image type. Allowed: {', '.join(sorted(LOGO_EXTENSIONS))}"
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Uploaded file is empty.")
    if len(raw) > settings.MAX_LOGO_UPLOAD_BYTES:
        raise HTTPException(
            400, f"File too large (max {settings.MAX_LOGO_UPLOAD_BYTES // 1024 // 1024} MB)."
        )

    logo_dir = Path(settings.CHATBOT_LOGO_DIR)
    logo_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{chatbot.id}.{ext}"
    (logo_dir / filename).write_bytes(raw)

    chatbot.logo_url = f"/uploads/chatbot_logos/{filename}"
    await db.commit()
    await db.refresh(chatbot)
    return ChatbotOut(**chatbot.to_dict())


@router.delete("/{chatbot_slug}/logo", response_model=ChatbotOut)
async def delete_chatbot_logo(
    chatbot_slug: str,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Remove this chatbot's uploaded logo, reverting to the default fallback."""
    chatbot = await _get_chatbot(chatbot_slug, space.id, db)

    if chatbot.logo_url:
        filename = chatbot.logo_url.rsplit("/", 1)[-1]
        logo_path = Path(settings.CHATBOT_LOGO_DIR) / filename
        logo_path.unlink(missing_ok=True)

    chatbot.logo_url = None
    await db.commit()
    await db.refresh(chatbot)
    return ChatbotOut(**chatbot.to_dict())

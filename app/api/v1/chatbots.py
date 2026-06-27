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

from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
from app.models.chatbot import Chatbot
from app.models.space import Space

logger = structlog.get_logger()
router = APIRouter(prefix="/chatbots", tags=["Chatbots"])


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
    active: Optional[bool] = None
    human_transfer_enabled: Optional[bool] = None
    human_transfer_message: Optional[str] = None


class ChatbotOut(BaseModel):
    id: str
    space_id: str
    api_key: Optional[str]
    slug: str
    display_name: str
    description: str
    logo_url: Optional[str]
    theme_color: Optional[str]
    is_default: bool
    active: bool
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


@router.post("", response_model=ChatbotOut, status_code=201)
async def create_chatbot(
    req: ChatbotCreate,
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Create a new chatbot for the space."""
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
    await db.commit()
    await db.refresh(chatbot)
    return ChatbotOut(**chatbot.to_dict())


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
    if req.active is not None:
        chatbot.active = req.active
    if req.human_transfer_enabled is not None:
        chatbot.human_transfer_enabled = req.human_transfer_enabled
    if req.human_transfer_message is not None:
        chatbot.human_transfer_message = req.human_transfer_message

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

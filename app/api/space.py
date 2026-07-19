"""Serve brand dashboard HTML pages and public org info."""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select

router = APIRouter(prefix="/space", tags=["Space UI"])

_UI_DIR = Path(__file__).parent.parent / "org_ui"


def _html(name: str) -> HTMLResponse:
    return HTMLResponse((_UI_DIR / name).read_text())


@router.get("/login", response_class=HTMLResponse)
async def brand_login():
    return _html("login.html")


@router.get("/dashboard", response_class=HTMLResponse)
async def brand_dashboard():
    return _html("dashboard.html")


@router.get("/", response_class=RedirectResponse)
async def brand_root():
    return RedirectResponse("/api/v1/space/login")


@router.get("/search")
async def org_search(q: str = ""):
    """Public org search — returns matching active orgs by name or slug."""
    from app.core.database import AsyncSessionLocal
    from app.models.space import Space
    from sqlalchemy import or_, func
    if not q or len(q.strip()) < 1:
        return {"results": []}
    db = AsyncSessionLocal()
    try:
        term = f"%{q.strip().lower()}%"
        result = await db.execute(
            select(Space)
            .where(
                Space.active == True,
                or_(
                    func.lower(Space.display_name).like(term),
                    func.lower(Space.slug).like(term),
                )
            )
            .limit(6)
        )
        orgs = result.scalars().all()
        return {"results": [
            {"name": o.display_name, "slug": o.slug, "logo_url": o.logo_url, "theme_color": o.theme_color or "#4f46e5"}
            for o in orgs
        ]}
    finally:
        await db.close()


@router.get("/public/{slug}")
async def org_public_info(slug: str, chatbot_slug: str | None = Query(None, alias="chatbot")):
    """
    Public org branding info for the customer chat UI.

    chatbot_slug selects a specific chatbot's branding (name/logo/theme, each
    falling back to the org's); omitted or unknown → the default chatbot.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.space import Space
    from app.models.chatbot import Chatbot
    db = AsyncSessionLocal()
    try:
        result = await db.execute(
            select(Space).where(Space.slug == slug, Space.active == True)
        )
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Not found")

        base = select(Chatbot).where(Chatbot.space_id == org.id, Chatbot.active == True)
        chatbot = None
        if chatbot_slug:
            chatbot = (await db.execute(base.where(Chatbot.slug == chatbot_slug))).scalar_one_or_none()
        if chatbot is None:
            chatbot = (await db.execute(base.where(Chatbot.is_default == True))).scalar_one_or_none()

        # Effective logo: chatbot logo → org logo → none (frontend falls back to icon).
        # show_logo=False on the chatbot always forces the icon.
        if chatbot is not None:
            effective_logo = (chatbot.logo_url or org.logo_url) if chatbot.show_logo else None
        else:
            effective_logo = org.logo_url

        # A specific chatbot shows its own name/theme (falling back to the org's).
        name  = org.display_name
        theme = org.theme_color or "#4f46e5"
        if chatbot is not None and chatbot_slug:
            name  = chatbot.display_name or org.display_name
            theme = chatbot.theme_color or org.theme_color or "#4f46e5"

        return {
            "name":                   name,
            "slug":                   org.slug,
            "description":            (chatbot.description if chatbot else "") or "",
            "logo_url":               effective_logo,
            "theme_color":            theme,
            "human_transfer_enabled": chatbot.human_transfer_enabled if chatbot else True,
        }
    finally:
        await db.close()

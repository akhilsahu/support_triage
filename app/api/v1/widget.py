"""
Widget public endpoints — no JWT required.

GET /api/v1/widget/config?api_key=XXX
    Returns chatbot config needed by widget.js to render the launcher and
    direct the iframe.  Sends Access-Control-Allow-Origin: * so it works
    from any merchant's domain.

GET /api/v1/space/public/{slug}
    Returns public space / chatbot branding (name, logo, theme_color,
    human_transfer_enabled).  Used by CustomerChat.tsx inside the iframe.
    Also CORS open.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Widget"])

_CORS = {"Access-Control-Allow-Origin": "*"}


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_db() -> AsyncSession:
    from app.core.database import AsyncSessionLocal
    return AsyncSessionLocal()


# ── GET /api/v1/widget/config ─────────────────────────────────────────────────

@router.get("/api/v1/widget/config")
async def widget_config(api_key: str = Query(...)):
    """
    Public endpoint consumed by widget.js on every merchant site.
    Returns the minimal config required to render the launcher + iframe.
    """
    from app.models.chatbot import Chatbot
    from app.models.space import Space

    db = await _get_db()
    try:
        result = await db.execute(
            select(Chatbot).where(Chatbot.api_key == api_key, Chatbot.active == True)
        )
        chatbot = result.scalar_one_or_none()
        if not chatbot:
            raise HTTPException(404, "Invalid or inactive api_key.")

        # Fetch the space for display_name / logo fallbacks
        space_result = await db.execute(
            select(Space).where(Space.id == chatbot.space_id, Space.active == True)
        )
        space = space_result.scalar_one_or_none()
        if not space:
            raise HTTPException(404, "Space not found or inactive.")

        payload = {
            "slug":                   space.slug,
            "display_name":           chatbot.display_name or space.display_name,
            "logo_url":               chatbot.logo_url or space.logo_url,
            "theme_color":            chatbot.theme_color or space.theme_color or "#6366f1",
            "human_transfer_enabled": chatbot.human_transfer_enabled,
            "greeting":               chatbot.human_transfer_message or "",
            # "Powered by" attribution backlink — shown on the free plan, hidden on paid.
            "show_branding":          (space.plan or "free").lower() == "free",
        }
        return JSONResponse(payload, headers=_CORS)
    finally:
        await db.close()


# ── OPTIONS preflight for /api/v1/widget/config ───────────────────────────────

@router.options("/api/v1/widget/config")
async def widget_config_preflight():
    return JSONResponse(
        {},
        headers={
            **_CORS,
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


# NOTE: /api/v1/space/public/{slug} (GET + OPTIONS preflight) used to be defined
# here too, but app/api/space.py is registered first and wins the route, and the
# public-CORS middleware (main.py) handles the preflight + response headers. The
# shadowed duplicate was removed; the live handler lives in app/api/space.py.

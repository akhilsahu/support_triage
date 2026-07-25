"""
Chatbot customer (end-user) authentication and history endpoints.

POST /api/chat/{slug}/auth/google — sign in with Google, claim current session
GET  /api/chat/me                 — the signed-in customer's profile
GET  /api/chat/me/sessions        — their conversations, current space first

Distinct from app/api/customer.py (the anonymous chat surface) and from
app/api/v1/auth.py (space-OWNER dashboard auth). Identity here is platform-wide:
one login follows a customer across every space's chatbot, so their history is
theirs wherever they chat. See app/core/chatbot_auth.py for verification/tokens
and app/models/chatbot_user.py for the schema.
"""

from __future__ import annotations

import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.chatbot_auth import (
    create_customer_token, get_or_create_user, resolve_customer, verify_google_id_token,
)

logger = structlog.get_logger()
router = APIRouter(tags=["Chatbot Users"])

# Mirrors app/api/customer.py's _CORS — these endpoints sit on the same public
# customer surface and must be reachable from the hosted chat page.
_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


class GoogleLoginRequest(BaseModel):
    id_token: str
    # The anonymous session the customer is already chatting in, claimed on login
    # so the thread carries over instead of being stranded.
    session_id: Optional[str] = None


@router.options("/api/chat/{slug}/auth/google")
async def preflight_google_login(slug: str):
    return JSONResponse({}, headers=_CORS)


@router.post("/api/chat/{slug}/auth/google")
async def google_login(slug: str, req: GoogleLoginRequest,
                       chatbot_slug: Optional[str] = Query(None, alias="chatbot")):
    """
    Sign an end customer in with Google on the hosted chat page.

    Verifies the Google ID token, resolves it to a platform-wide ChatbotUser
    (creating the user, or linking this identity to an existing one), optionally
    claims the anonymous session they were already chatting in, and returns our
    own customer JWT.

    Nothing here is space-scoped; `slug` only scopes the session claim.
    """
    from app.api.customer import _get_brand
    from app.models.chat import ChatSession

    info = verify_google_id_token(req.id_token)

    org, chatbot, db = await _get_brand(slug, chatbot_slug)
    try:
        user = await get_or_create_user(
            db, provider="google", provider_sub=info["sub"],
            email=info.get("email"), name=info.get("name"),
            avatar_url=info.get("picture"),
        )

        # Claim the conversation already in progress, so signing in mid-chat keeps
        # the thread. Only ever claims an UNOWNED session in this space.
        if req.session_id:
            try:
                sess = (await db.execute(
                    select(ChatSession).where(
                        ChatSession.id == uuid.UUID(req.session_id),
                        ChatSession.space_id == org.id,
                        ChatSession.chatbot_user_id.is_(None),
                    )
                )).scalar_one_or_none()
                if sess is not None:
                    sess.chatbot_user_id = user.id
            except (ValueError, TypeError):
                pass

        token = create_customer_token(user.id)
        payload = {"token": token, "user": user.to_dict()}
        await db.commit()
        return JSONResponse(payload, headers=_CORS)
    finally:
        await db.close()


@router.get("/api/chat/me")
async def get_me(authorization: Optional[str] = Header(None)):
    """The signed-in customer's profile, or 401. Lets the widget validate a
    stored token on load instead of trusting localStorage."""
    from app.core.database import AsyncSessionLocal
    db = AsyncSessionLocal()
    try:
        user = await resolve_customer(authorization, db)
        if user is None:
            return JSONResponse({"detail": "Not signed in."}, status_code=401, headers=_CORS)
        return JSONResponse({"user": user.to_dict()}, headers=_CORS)
    finally:
        await db.close()


@router.get("/api/chat/me/sessions")
async def my_sessions(current: Optional[str] = Query(None),
                      authorization: Optional[str] = Header(None)):
    """
    The customer's conversations across every space, for the history drawer.

    Ordered with the space they're currently chatting in first (most recent
    first), then all other spaces. `current` is the space slug of the widget
    making the call.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.chat import ChatSession
    from app.models.space import Space
    from app.models.chatbot import Chatbot

    db = AsyncSessionLocal()
    try:
        user = await resolve_customer(authorization, db)
        if user is None:
            return JSONResponse({"detail": "Not signed in."}, status_code=401, headers=_CORS)

        rows = (await db.execute(
            select(ChatSession, Space, Chatbot)
            .join(Space, Space.id == ChatSession.space_id)
            .outerjoin(Chatbot, Chatbot.id == ChatSession.chatbot_id)
            .where(ChatSession.chatbot_user_id == user.id)
            .order_by(ChatSession.last_message_at.desc())
            .limit(100)
        )).all()

        sessions = [{
            "id":              str(sess.id),
            "title":           sess.title or "New conversation",
            "status":          sess.status,
            "message_count":   sess.message_count,
            "last_message_at": sess.last_message_at.isoformat() if sess.last_message_at else None,
            "space_slug":      space.slug,
            "space_name":      space.display_name,
            "space_logo_url":  space.logo_url,
            "chatbot_slug":    bot.slug if bot else None,
            "is_current_space": bool(current) and space.slug == current,
        } for sess, space, bot in rows]

        # Current space on top (already date-sorted within each group).
        sessions.sort(key=lambda s: not s["is_current_space"])
        return JSONResponse({"sessions": sessions}, headers=_CORS)
    finally:
        await db.close()

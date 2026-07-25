"""
End-customer (chatbot user) authentication.

Separate from app/core/auth.py, which authenticates SPACE OWNERS into the
dashboard. This module authenticates the CUSTOMERS chatting with a bot, so
their conversation history follows them across the platform.

v1 provider is Google (ID-token flow on the hosted chat page, a first-party
context where Google Identity Services works without iframe/3p-cookie
workarounds). The identity lookup goes through ChatbotUserIdentity, so adding
phone/email/facebook later is a new provider string, not a schema change.

Tokens issued here carry typ="customer" and are validated by
`current_customer` / `optional_customer` — an owner token can never be used as
a customer token, or vice versa.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import structlog
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.models.chatbot_user import ChatbotUser, ChatbotUserIdentity

logger = structlog.get_logger()

ALGORITHM = "HS256"
_TOKEN_TYPE = "customer"


def _secret() -> str:
    return settings.SECRET_KEY


# ── Token helpers ─────────────────────────────────────────────────────────────

def create_customer_token(user_id: UUID | str) -> str:
    """Signed JWT identifying a chatbot user. Long-lived by design (30d default)
    so a customer's history persists without repeated logins."""
    payload = {
        "sub": str(user_id),
        "typ": _TOKEN_TYPE,
        "exp": datetime.utcnow() + timedelta(hours=settings.CHATBOT_USER_JWT_TTL_HOURS),
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def _decode_customer_token(token: str) -> Optional[str]:
    """Return the chatbot user id, or None if the token is invalid/expired/not
    a customer token. Never raises — callers decide whether absence is fatal."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("typ") != _TOKEN_TYPE:
        return None
    return payload.get("sub")


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


# ── FastAPI dependencies ──────────────────────────────────────────────────────

async def optional_customer(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[ChatbotUser]:
    """The signed-in chatbot user, or None. Used on the customer chat endpoints,
    which stay usable anonymously unless the bot's gate says otherwise."""
    token = _bearer(authorization)
    if not token:
        return None
    user_id = _decode_customer_token(token)
    if not user_id:
        return None
    try:
        return await db.get(ChatbotUser, UUID(user_id))
    except (ValueError, TypeError):
        return None


async def resolve_customer(
    authorization: Optional[str], db: AsyncSession,
) -> Optional[ChatbotUser]:
    """Same as `optional_customer`, but plain-callable with a session the caller
    already owns -- the customer chat endpoints manage their own session via
    `_get_brand` rather than Depends(get_db)."""
    token = _bearer(authorization)
    if not token:
        return None
    user_id = _decode_customer_token(token)
    if not user_id:
        return None
    try:
        return await db.get(ChatbotUser, UUID(user_id))
    except (ValueError, TypeError):
        return None


async def current_customer(
    user: Optional[ChatbotUser] = Depends(optional_customer),
) -> ChatbotUser:
    """Require a signed-in chatbot user (401 otherwise)."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ── Google ID-token verification ──────────────────────────────────────────────

def verify_google_id_token(id_token_str: str) -> dict:
    """Verify a Google ID token against Google's public keys and our client id.

    Returns {sub, email, name, picture}. Raises HTTPException(401) on anything
    untrusted -- bad signature, wrong audience, or an unverified email address.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google sign-in is not configured on this server.")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as e:
        raise HTTPException(503, f"Google sign-in dependency missing: {e}")

    try:
        info = google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), settings.GOOGLE_CLIENT_ID,
        )
    except Exception as e:
        logger.warning("chatbot_auth.google_verify_failed", error=str(e))
        raise HTTPException(401, "Could not verify Google sign-in.")

    # verify_oauth2_token already checks signature, expiry and audience; the
    # issuer and a verified email are ours to enforce.
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Could not verify Google sign-in.")
    if not info.get("email_verified"):
        raise HTTPException(401, "Your Google email is not verified.")
    sub = info.get("sub")
    if not sub:
        raise HTTPException(401, "Could not verify Google sign-in.")

    return {
        "sub": sub,
        "email": info.get("email"),
        "name": info.get("name"),
        "picture": info.get("picture"),
    }


# ── Identity resolution ───────────────────────────────────────────────────────

async def get_or_create_user(
    db: AsyncSession, *, provider: str, provider_sub: str,
    email: Optional[str] = None, name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> ChatbotUser:
    """Resolve a verified identity to a ChatbotUser, creating or linking it.

    1. Known (provider, provider_sub) -> that user.
    2. Otherwise, if a user already exists with this VERIFIED email, link the new
       identity to them (so signing in with Google after a future phone/email
       login lands on one person rather than a duplicate).
    3. Otherwise create the user and identity.

    Only ever called with an already-verified identity.
    """
    identity = (await db.execute(
        select(ChatbotUserIdentity).where(
            ChatbotUserIdentity.provider == provider,
            ChatbotUserIdentity.provider_sub == provider_sub,
        )
    )).scalar_one_or_none()

    if identity is not None:
        user = await db.get(ChatbotUser, identity.user_id)
        if user is not None:
            # Keep the profile fresh from the provider.
            if email:
                user.email = email
            if name:
                user.name = name
            if avatar_url:
                user.avatar_url = avatar_url
            user.last_seen_at = datetime.utcnow()
            return user

    user = None
    if email:
        user = (await db.execute(
            select(ChatbotUser).where(ChatbotUser.email == email)
        )).scalar_one_or_none()

    if user is None:
        user = ChatbotUser(email=email, name=name, avatar_url=avatar_url)
        db.add(user)
        await db.flush()
    else:
        if name and not user.name:
            user.name = name
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url

    user.last_seen_at = datetime.utcnow()
    db.add(ChatbotUserIdentity(user_id=user.id, provider=provider, provider_sub=provider_sub))
    await db.flush()
    return user

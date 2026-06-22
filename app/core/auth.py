"""
JWT authentication helpers and FastAPI dependency.

Usage:
    from app.core.auth import create_token, current_space

    @router.post("/login")
    async def login(...):
        token = create_token({"sub": str(org.id), "slug": org.slug})

    @router.get("/me")
    async def me(brand: Space = Depends(current_space)):
        return org.to_dict()
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

logger = structlog.get_logger()

# ── Config ────────────────────────────────────────────────────────────────────

from app.config import settings

ALGORITHM   = "HS256"
TOKEN_TTL_H = settings.JWT_TTL_HOURS

def _secret() -> str:
    """Always read from settings — never cached at module level."""
    return settings.SECRET_KEY

# Password hashing
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# Bearer extractor (auto 401 if missing)
_bearer = HTTPBearer(auto_error=True)


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


# ── Token helpers ─────────────────────────────────────────────────────────────

def create_token(data: dict, expires_hours: int = TOKEN_TTL_H) -> str:
    """Create a signed JWT with an expiry claim.

    Callers must include "tv" (token_version) from the Space row so that
    logout and password-change can invalidate all live tokens by incrementing
    the version counter.
    """
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=expires_hours)}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises HTTPException 401 on failure."""
    try:
        return jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except JWTError:
        # Don't echo the underlying jose error — avoids leaking token internals.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def current_space(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    """
    FastAPI dependency — extracts and validates the JWT from the
    Authorization: Bearer <token> header, returns the Brand ORM object.

    Usage:
        @router.get("/me")
        async def me(brand = Depends(current_space)):
            ...
    """
    from app.models.space import Space   # avoid circular import at module level

    payload = decode_token(creds.credentials)
    space_id: Optional[str] = payload.get("sub")
    if not space_id:
        raise HTTPException(status_code=401, detail="Token missing subject claim.")

    result = await db.execute(select(Space).where(Space.id == space_id))
    org = result.scalar_one_or_none()
    if not org or not org.active:
        raise HTTPException(status_code=401, detail="Space account not found or inactive.")

    # Revocation check — token_version in JWT must match the DB value.
    # Logout and password-change increment the DB counter, invalidating all prior tokens.
    token_tv = payload.get("tv")
    if token_tv is not None and int(token_tv) != int(org.token_version or 1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return org

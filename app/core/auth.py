"""
JWT authentication helpers and FastAPI dependency.

Usage:
    from app.core.auth import create_token, current_brand

    @router.post("/login")
    async def login(...):
        token = create_token({"sub": str(org.id), "slug": org.slug})

    @router.get("/me")
    async def me(brand: Organization = Depends(current_brand)):
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

SECRET_KEY  = settings.JWT_SECRET
ALGORITHM   = "HS256"
TOKEN_TTL_H = settings.JWT_TTL_HOURS

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
    """Create a signed JWT with an expiry claim."""
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=expires_hours)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises HTTPException 401 on failure."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def current_brand(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    """
    FastAPI dependency — extracts and validates the JWT from the
    Authorization: Bearer <token> header, returns the Brand ORM object.

    Usage:
        @router.get("/me")
        async def me(brand = Depends(current_brand)):
            ...
    """
    from app.models.org import Organization   # avoid circular import at module level

    payload = decode_token(creds.credentials)
    org_id: Optional[str] = payload.get("sub")
    if not org_id:
        raise HTTPException(status_code=401, detail="Token missing subject claim.")

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org or not org.active:
        raise HTTPException(status_code=401, detail="Organization account not found or inactive.")
    return org

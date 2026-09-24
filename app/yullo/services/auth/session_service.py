import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from uuid import UUID

from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.yullo_user_session import YulloUserSession
from app.models.user import User
from app.config import settings

def _hash_token(token: str) -> str:
    """SHA-256 hash a token to store safely."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def _get_cookie_name() -> str:
    return "__Host-yullo_session" if settings.ENVIRONMENT == "production" else "yullo_session_dev"

async def create_yullo_session(db: AsyncSession, user_id: UUID, response: Response) -> str:
    """Creates a new session, sets the cookie, and returns the raw CSRF token for memory."""
    session_token = secrets.token_hex(32)
    csrf_token = secrets.token_hex(32)
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    
    # Rotate out old sessions (limit to 5 per user)
    stmt = select(YulloUserSession).where(YulloUserSession.user_id == user_id).order_by(YulloUserSession.created_at.desc())
    res = await db.execute(stmt)
    existing_sessions = res.scalars().all()
    if len(existing_sessions) >= 5:
        for old_session in existing_sessions[4:]:
            await db.delete(old_session)
    
    db_session = YulloUserSession(
        user_id=user_id,
        token_hash=_hash_token(session_token),
        csrf_hash=_hash_token(csrf_token),
        expires_at=expires_at
    )
    db.add(db_session)
    await db.commit()
    
    is_prod = settings.ENVIRONMENT == "production"
    
    response.set_cookie(
        key=_get_cookie_name(),
        value=session_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        path="/",
        max_age=30 * 24 * 3600
    )
    
    return csrf_token

async def resolve_yullo_session(db: AsyncSession, request: Request) -> Optional[Tuple[User, YulloUserSession]]:
    """Resolves the session from the cookie and returns (User, YulloUserSession)."""
    token = request.cookies.get(_get_cookie_name())
    if not token:
        return None
        
    token_hash = _hash_token(token)
    stmt = (
        select(User, YulloUserSession)
        .join(YulloUserSession, YulloUserSession.user_id == User.id)
        .where(YulloUserSession.token_hash == token_hash)
        .where(YulloUserSession.revoked_at.is_(None))
        .where(YulloUserSession.expires_at > datetime.now(timezone.utc))
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        return None
        
    user, session = row
    
    # Bounded update of last_seen_at (e.g. every 1 hour)
    if (datetime.now(timezone.utc) - session.last_seen_at) > timedelta(hours=1):
        session.last_seen_at = datetime.now(timezone.utc)
        await db.commit()
    
    return user, session

def validate_yullo_csrf(request: Request, session: YulloUserSession) -> bool:
    """Validates the X-Yullo-CSRF header against the session CSRF hash."""
    provided_csrf = request.headers.get("X-Yullo-CSRF")
    if not provided_csrf:
        return False
    return secrets.compare_digest(_hash_token(provided_csrf), session.csrf_hash)

async def revoke_yullo_session(db: AsyncSession, request: Request, response: Response):
    """Revokes the current session and clears the cookie."""
    token = request.cookies.get(_get_cookie_name())
    if token:
        token_hash = _hash_token(token)
        stmt = select(YulloUserSession).where(YulloUserSession.token_hash == token_hash)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if session:
            session.revoked_at = datetime.now(timezone.utc)
            await db.commit()
            
    is_prod = settings.ENVIRONMENT == "production"
    response.delete_cookie(key=_get_cookie_name(), path="/", secure=is_prod, httponly=True, samesite="lax")

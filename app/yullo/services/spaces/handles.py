import re
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.utils.reserved_slugs import is_reserved_slug


async def validate_handle_format_and_availability(
    db: AsyncSession,
    handle: str,
    owner_user_id: uuid.UUID
) -> dict:
    """
    Validates a requested handle (slug) for format, reserved status, and collisions.
    Returns {"valid": bool, "reason": Optional[str]}.
    """
    clean_handle = handle.strip().lower()
    
    # 1. Format check
    if len(clean_handle) < 3 or len(clean_handle) > 50:
        return {"valid": False, "reason": "Handle must be between 3 and 50 characters."}
    if not re.match(r"^[a-z0-9_-]+$", clean_handle):
        return {"valid": False, "reason": "Only lowercase letters, numbers, hyphens and underscores allowed."}
        
    # 2. Reserved check
    if is_reserved_slug(clean_handle):
        return {"valid": False, "reason": "This handle is reserved."}
        
    # 3. Collision check
    result = await db.execute(select(Space).where(Space.slug == clean_handle))
    existing = result.scalars().first()
    
    if existing:
        if existing.current_step == "managed":
            return {"valid": False, "reason": "Handle is taken."}
        # If it's the user's own draft, they can keep it
        if existing.owner_user_id == owner_user_id and existing.status == "draft":
            return {"valid": True, "reason": None}
            
        if existing.status == "draft" and existing.handle_reserved_until and existing.handle_reserved_until > datetime.utcnow():
            return {"valid": False, "reason": "Handle is taken or temporarily reserved."}
        if existing.status == "live":
            return {"valid": False, "reason": "Handle is taken."}
            
    return {"valid": True, "reason": None}

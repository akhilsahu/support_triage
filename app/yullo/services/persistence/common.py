import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace

async def finalize_space_mutation(
    db: AsyncSession, 
    *, 
    user_id: uuid.UUID, 
    space_id: uuid.UUID,
    public_content_changed: bool,
    operation_key: str
) -> None:
    """
    Finalizes a mutation to a space's data by incrementing context_version.
    If the space is already published and public content changed, it will 
    advance published_version and published_at.
    """
    space = await db.scalar(select(Space).where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == 'yullo').with_for_update())
    if not space:
        raise HTTPException(status_code=403, detail="Not authorized or Yullo space not found")
        
    yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == space_id).with_for_update())
    if not yullo_space:
        raise HTTPException(status_code=404, detail="YulloSpace not found")
        
    # Increment context version
    yullo_space.context_version += 1
    
    # If it's a public change and the space is live, advance the published version
    if public_content_changed and yullo_space.lifecycle_status == "published":
        yullo_space.published_version = yullo_space.context_version
        yullo_space.published_at = datetime.now(timezone.utc)

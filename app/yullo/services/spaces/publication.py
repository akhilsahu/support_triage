import uuid
import logging
import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_config import YulloConfig
from app.models.knowledge_base import KnowledgeBase
from app.utils.reserved_slugs import is_reserved_slug
from app.models.yullo_home_event import YulloHomeEvent

logger = logging.getLogger(__name__)

async def validate_publication_readiness(db: AsyncSession, *, space_id: uuid.UUID, owner_user_id: uuid.UUID) -> bool:
    stmt = select(Space).where(Space.id == space_id, Space.product == 'yullo')
    space = (await db.execute(stmt)).scalars().first()
    if not space:
        return False
        
    if space.owner_user_id != owner_user_id:
        return False
        
    # Publishing identity does not imply that Aura has finished learning.
    if not space.display_name or not space.display_name.strip():
        return False
    purpose = {"personal": "person", "work": "creator"}.get(space.purpose, space.purpose)
    if purpose not in ("person", "creator", "business", "organization"):
        return False
    if (not space.slug or space.slug.startswith("draft-")
            or not re.fullmatch(r"[a-z0-9_-]{3,50}", space.slug)
            or is_reserved_slug(space.slug)):
        return False
        
    y_space = (await db.execute(select(YulloSpace).where(YulloSpace.space_id == space_id))).scalars().first()
    y_config = (await db.execute(select(YulloConfig).where(YulloConfig.space_id == space_id))).scalars().first()
    
    if not y_space or not y_config:
        return False
        
    kb = (await db.execute(select(KnowledgeBase).where(KnowledgeBase.space_id == space_id))).scalars().first()
    if not kb:
        return False
        
    # Source status and candidate approval are enforced by knowledge readers,
    # indexing and review. Pending/failed sources must not block the identity page.
    return True

async def publish_space(db: AsyncSession, *, space_id: uuid.UUID, owner_user_id: uuid.UUID) -> None:
    stmt = select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == space_id, Space.product == "yullo"
    ).with_for_update(of=Space)
    
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Space not found")
        
    space, y_space = row
    
    if space.owner_user_id != owner_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to publish this space")
    
    expected_context_version = y_space.context_version
    
    if space.status == "live" and y_space.published_version == expected_context_version:
        # Already published same version is no-op
        return
        
    success = await validate_publication_readiness(db, space_id=space_id, owner_user_id=owner_user_id)
    if not success:
        logger.info("yullo.publication.not_ready", extra={"space_id": str(space_id)})
        raise HTTPException(status_code=409, detail="Check the Space name, type and link, then try again.")
        
    space.status = "live"
    
    y_space.lifecycle_status = "live"
    y_space.published_version = expected_context_version
    y_space.published_at = datetime.utcnow()
    
    # Emit space.published directly using YulloHomeEvent to match ingestion orchestration
    dedupe_key = f"space.published:{space.id}:{expected_context_version}"
    # Republishing an unchanged version reuses its existing activity event.
    event = insert(YulloHomeEvent).values(
        space_id=space.id,
        event_type="space.published",
        subject_type="space",
        subject_id=str(space.id),
        dedupe_key=dedupe_key,
        event_metadata={"published_version": expected_context_version}
    ).on_conflict_do_nothing(index_elements=["space_id", "dedupe_key"])
    await db.execute(event)
    
    await db.flush()

async def unpublish_space(db: AsyncSession, *, space_id: uuid.UUID, owner_user_id: uuid.UUID) -> None:
    from app.yullo.services.spaces.hierarchy import lock_hierarchy
    await lock_hierarchy(db, owner_user_id)
    stmt = select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == space_id, Space.product == "yullo"
    ).with_for_update(of=Space)
    
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Space not found")
        
    space, y_space = row
    
    if space.owner_user_id != owner_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to unpublish this space")
        
    if space.status == "draft" and y_space.lifecycle_status == "draft":
        return
        
    from app.yullo.services.spaces.beacon import pause_branch_beacons
    await pause_branch_beacons(db, space_id)
    space.status = "draft"
    y_space.lifecycle_status = "draft"
    
    await db.flush()

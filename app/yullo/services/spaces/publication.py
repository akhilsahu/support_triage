import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_config import YulloConfig
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.yullo_home_event import YulloHomeEvent

async def validate_publication_readiness(db: AsyncSession, *, space_id: uuid.UUID, owner_user_id: uuid.UUID) -> bool:
    stmt = select(Space).where(Space.id == space_id, Space.product == 'yullo')
    space = (await db.execute(stmt)).scalars().first()
    if not space:
        return False
        
    if space.owner_user_id != owner_user_id:
        return False
        
    if not space.slug or space.slug.startswith("draft-"):
        return False
        
    y_space = (await db.execute(select(YulloSpace).where(YulloSpace.space_id == space_id))).scalars().first()
    y_config = (await db.execute(select(YulloConfig).where(YulloConfig.space_id == space_id))).scalars().first()
    
    if not y_space or not y_config:
        return False
        
    kb = (await db.execute(select(KnowledgeBase).where(KnowledgeBase.space_id == space_id))).scalars().first()
    if not kb:
        return False
        
    items_stmt = select(KnowledgeBaseItem).where(KnowledgeBaseItem.kb_id == kb.id)
    items = (await db.execute(items_stmt)).scalars().all()
    
    if items:
        ready_item = any(
            item.ingestion_status in ('ready', 'completed', 'indexed', 'queued', None) or 
            (isinstance(item.source_metadata, dict) and item.source_metadata.get('status') in ('ready', 'queued'))
            for item in items
        )
        if not ready_item:
            return False
        
    return True

async def publish_space(db: AsyncSession, *, space_id: uuid.UUID, owner_user_id: uuid.UUID) -> None:
    stmt = select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == space_id
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
        raise HTTPException(status_code=503, detail="Publication readiness check failed")
        
    space.status = "live"
    
    y_space.lifecycle_status = "live"
    y_space.published_version = expected_context_version
    y_space.published_at = datetime.utcnow()
    
    # Emit space.published directly using YulloHomeEvent to match ingestion orchestration
    dedupe_key = f"space.published:{space.id}:{expected_context_version}"
    event = YulloHomeEvent(
        space_id=space.id,
        event_type="space.published",
        subject_type="space",
        subject_id=str(space.id),
        dedupe_key=dedupe_key,
        event_metadata={"published_version": expected_context_version}
    )
    db.add(event)
    
    await db.flush()

async def unpublish_space(db: AsyncSession, *, space_id: uuid.UUID, owner_user_id: uuid.UUID) -> None:
    stmt = select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == space_id
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
        
    space.status = "draft"
    y_space.lifecycle_status = "draft"
    
    await db.flush()

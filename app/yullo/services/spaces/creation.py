import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_config import YulloConfig
from app.models.knowledge_base import KnowledgeBase
from app.models.user import User
from app.yullo.schemas.spaces import SpaceType
from app.yullo.services.spaces.hierarchy import lock_hierarchy, require_parent, mark_managed

class CreatedYulloSpace:
    def __init__(self, space: Space, yullo_space: YulloSpace, yullo_config: YulloConfig, kb: KnowledgeBase):
        self.space = space
        self.yullo_space = yullo_space
        self.yullo_config = yullo_config
        self.kb = kb

async def create_or_resolve_yullo_space(
    db: AsyncSession, 
    *, 
    owner_user_id: uuid.UUID, 
    slug: str, 
    purpose: str,
    title: str = "My Space",
    status: str = "draft",
    current_step: str = "claim",
    parent_space_id: uuid.UUID | None = None,
    space_type: SpaceType | str | None = None,
) -> CreatedYulloSpace:
    """
    Creates or resolves a canonical Yullo Space.
    Returns the existing Space if the slug matches the owner.
    Raises conflict if the slug belongs to a different user or namespace.
    """
    
    try:
        canonical_type = SpaceType(space_type or "space").value
    except ValueError:
        raise HTTPException(status_code=422, detail="Unsupported Space type")
    if parent_space_id is not None:
        await lock_hierarchy(db, owner_user_id)
        await require_parent(db, owner_user_id, parent_space_id)
        await mark_managed(db, parent_space_id)
        # Managed child drafts must never be selected/reset by global onboarding.
        current_step = "managed"

    # 1. Resolve existing space by slug
    stmt = select(Space).where(Space.slug == slug)
    result = await db.execute(stmt)
    existing_space = result.scalars().first()
    
    if existing_space:
        if existing_space.product != "yullo":
            raise HTTPException(status_code=409, detail="Slug belongs to a non-Yullo product.")
        
        if existing_space.owner_user_id != owner_user_id:
            raise HTTPException(status_code=409, detail="Slug belongs to another user.")
            
        # Ensure relationships exist
        yullo_space_stmt = select(YulloSpace).where(YulloSpace.space_id == existing_space.id)
        yullo_config_stmt = select(YulloConfig).where(YulloConfig.space_id == existing_space.id)
        kb_stmt = select(KnowledgeBase).where(KnowledgeBase.space_id == existing_space.id)
        
        yullo_space = (await db.execute(yullo_space_stmt)).scalars().first()
        yullo_config = (await db.execute(yullo_config_stmt)).scalars().first()
        kb = (await db.execute(kb_stmt)).scalars().first()
        
        if not yullo_space or not yullo_config or not kb:
            raise HTTPException(status_code=500, detail="Space is corrupted, missing canonical extensions.")
        if parent_space_id is not None and yullo_space.parent_space_id != parent_space_id:
            raise HTTPException(status_code=409, detail="Space already exists under a different parent")
        if space_type is not None and yullo_space.space_type != canonical_type:
            raise HTTPException(status_code=409, detail="Space already exists with a different type")
            
        return CreatedYulloSpace(space=existing_space, yullo_space=yullo_space, yullo_config=yullo_config, kb=kb)
        
    # 2. Create new Space atomically
    new_space = Space(
        id=uuid.uuid4(),
        owner_user_id=owner_user_id,
        slug=slug,
        product="yullo",
        display_name=title,
        email=f"{slug}@{uuid.uuid4().hex[:8]}.yullo.local", # Temporary Dummy email
        password_hash="draft-no-password",
        status=status,
        purpose=purpose,
        current_step=current_step
    )
    db.add(new_space)
    
    new_yullo_space = YulloSpace(
        space_id=new_space.id,
        parent_space_id=parent_space_id,
        space_type=canonical_type,
        purpose=purpose,
        onboarding_step=current_step,
        lifecycle_status=status
    )
    db.add(new_yullo_space)
    
    new_kb = KnowledgeBase(
        id=uuid.uuid4(),
        space_id=new_space.id,
        name=f"Primary KB for {title}",
        active=True
    )
    db.add(new_kb)
    
    new_yullo_config = YulloConfig(
        space_id=new_space.id,
        settings={"knowledge": {"primary_kb_id": str(new_kb.id)}}
    )
    db.add(new_yullo_config)
    
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Conflict during Space creation.")
        
    return CreatedYulloSpace(space=new_space, yullo_space=new_yullo_space, yullo_config=new_yullo_config, kb=new_kb)

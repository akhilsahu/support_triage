import uuid
from typing import Optional
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.yullo.adapters.home_events import append_domain_event
from app.yullo.services.entities.contracts import SpaceEntityDTO, EntityCommand, EntityPatch
from app.yullo.services.entities.payloads import validate_entity_payload

async def _require_space_owner(db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID) -> None:
    stmt = select(YulloSpace).join(Space, YulloSpace.space_id == Space.id).where(
        Space.id == space_id,
        Space.owner_user_id == user_id,
        Space.product == "yullo"
    )
    yullo_space = await db.scalar(stmt)
    if not yullo_space:
        raise HTTPException(status_code=403, detail="Not authorized or Yullo space not found")

def _is_eligible(entity: YulloSpaceEntity) -> bool:
    return entity.is_active and entity.is_public and entity.review_status in ('owner_confirmed', 'source_authoritative')

async def create_owner_entity(db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID, command: EntityCommand, entity_id: Optional[uuid.UUID] = None) -> SpaceEntityDTO:
    await _require_space_owner(db, space_id, user_id)
    
    try:
        normalized_payload = validate_entity_payload(command.entity_type, command.schema_version, command.payload_json)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    
    existing = None
    if entity_id:
        stmt = select(YulloSpaceEntity).where(YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id)
        existing = (await db.execute(stmt)).scalars().first()
    elif command.identity_key:
        stmt = select(YulloSpaceEntity).where(
            YulloSpaceEntity.space_id == space_id,
            YulloSpaceEntity.entity_type == command.entity_type,
            YulloSpaceEntity.identity_key == command.identity_key
        )
        existing = (await db.execute(stmt)).scalars().first()

    if existing:
        if existing.entity_type != command.entity_type or existing.payload_json != normalized_payload:
            raise HTTPException(status_code=409, detail="Entity exists with same ID/identity_key but different payload/type")
        return SpaceEntityDTO.model_validate(existing)
        
    new_id = entity_id or uuid.uuid4()
    kwargs = {
        "id": new_id,
        "space_id": space_id,
        "identity_key": command.identity_key or str(new_id),
        "entity_type": command.entity_type,
        "schema_version": command.schema_version,
        "payload_json": normalized_payload,
        "origin_type": "owner",
        "review_status": "owner_confirmed",
        "is_active": True,
        "is_public": command.is_public,
        "revision": 1
    }
        
    entity = YulloSpaceEntity(**kwargs)
    db.add(entity)
    await db.flush()
    
    if _is_eligible(entity):
        await append_domain_event(
            db,
            space_id=space_id,
            event_type="entity.published",
            subject_type="entity",
            subject_id=str(entity.id),
            operation_key=f"entity.published:{entity.id}:{entity.revision}",
            occurred_at=datetime.utcnow(),
            metadata={"entity_type": entity.entity_type, "revision": entity.revision}
        )
        
    return SpaceEntityDTO.model_validate(entity)

async def update_entity(db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID, entity_id: uuid.UUID, patch: EntityPatch) -> SpaceEntityDTO:
    await _require_space_owner(db, space_id, user_id)
    stmt = select(YulloSpaceEntity).where(
        and_(YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id)
    ).with_for_update()
    entity = await db.scalar(stmt)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
        
    was_eligible = _is_eligible(entity)
    changed = False
    
    if patch.payload_json is not None:
        try:
            # Validate patch as full merged payload (assuming patch.payload_json is the full new payload in this context)
            normalized_payload = validate_entity_payload(entity.entity_type, entity.schema_version, patch.payload_json)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
            
        if normalized_payload != entity.payload_json:
            entity.payload_json = normalized_payload
            changed = True
            
    if patch.is_active is not None and patch.is_active != entity.is_active:
        entity.is_active = patch.is_active
        changed = True
    if patch.is_public is not None and patch.is_public != entity.is_public:
        entity.is_public = patch.is_public
        changed = True
        
    if changed:
        entity.revision += 1
        
    is_now_eligible = _is_eligible(entity)
    
    if not was_eligible and is_now_eligible:
        await append_domain_event(
            db,
            space_id=space_id,
            event_type="entity.published",
            subject_type="entity",
            subject_id=str(entity.id),
            operation_key=f"entity.published:{entity.id}:{entity.revision}",
            occurred_at=datetime.utcnow(),
            metadata={"entity_type": entity.entity_type, "revision": entity.revision}
        )
        
    await db.flush()
    return SpaceEntityDTO.model_validate(entity)

async def confirm_entity(db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID, entity_id: uuid.UUID, expected_revision: int) -> SpaceEntityDTO:
    await _require_space_owner(db, space_id, user_id)
    stmt = select(YulloSpaceEntity).where(
        and_(YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id)
    ).with_for_update()
    entity = await db.scalar(stmt)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
        
    if entity.revision != expected_revision:
        raise HTTPException(status_code=409, detail="Revision mismatch")
        
    was_eligible = _is_eligible(entity)
    
    if entity.review_status != "owner_confirmed":
        if entity.origin_type == "extracted":
            from app.models.yullo_space_entity import YulloSpaceEntityEvidence
            stmt_ev = select(YulloSpaceEntityEvidence).where(YulloSpaceEntityEvidence.entity_id == entity.id)
            ev_list = (await db.execute(stmt_ev)).scalars().all()
            if not ev_list:
                raise HTTPException(status_code=422, detail="Cannot confirm extracted entity without evidence")
        entity.review_status = "owner_confirmed"
        entity.revision += 1
        
    is_now_eligible = _is_eligible(entity)
    
    if not was_eligible and is_now_eligible:
        await append_domain_event(
            db,
            space_id=space_id,
            event_type="entity.published",
            subject_type="entity",
            subject_id=str(entity.id),
            operation_key=f"entity.published:{entity.id}:{entity.revision}",
            occurred_at=datetime.utcnow(),
            metadata={"entity_type": entity.entity_type, "revision": entity.revision}
        )
        
    await db.flush()
    return SpaceEntityDTO.model_validate(entity)

async def archive_entity(db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID, entity_id: uuid.UUID) -> None:
    await _require_space_owner(db, space_id, user_id)
    stmt = select(YulloSpaceEntity).where(
        and_(YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id)
    ).with_for_update()
    entity = await db.scalar(stmt)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
        
    entity.is_active = False
    entity.revision += 1
    await db.flush()

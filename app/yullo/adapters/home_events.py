import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.yullo_home_event import YulloHomeEvent

logger = logging.getLogger(__name__)

# Allowed metadata schema per event type
ALLOWED_METADATA_KEYS = {
    "source.updated": {"version", "item_id", "job_id"},
    "source.failed": {"version", "item_id", "job_id", "error_code"},
    "space.published": {"published_version"},
    "entity.published": {"entity_type", "revision"}
}


async def append_domain_event(
    db: AsyncSession, 
    *, 
    space_id: UUID, 
    event_type: str,
    subject_type: str, 
    subject_id: str, 
    operation_key: str,
    occurred_at: datetime, 
    metadata: dict
) -> UUID:
    """
    Append a non-conversation Yullo domain event with strict payload constraints.
    Insert uses ON CONFLICT on (space_id, dedupe_key) DO NOTHING to allow safe retries.
    """
    # 1. Validate payload allowlist
    allowed_keys = ALLOWED_METADATA_KEYS.get(event_type, set())
    validated_metadata = {}
    
    if allowed_keys:
        for k in allowed_keys:
            if k in metadata:
                validated_metadata[k] = metadata[k]
                
    if set(metadata.keys()) - allowed_keys:
        logger.warning(
            f"Filtered disallowed metadata keys for event {event_type}. "
            f"Allowed: {allowed_keys}, Provided: {list(metadata.keys())}"
        )

    # 2. Insert with ON CONFLICT DO NOTHING
    stmt = insert(YulloHomeEvent).values(
        space_id=space_id,
        event_type=event_type,
        subject_type=subject_type,
        subject_id=subject_id,
        dedupe_key=operation_key,
        event_metadata=validated_metadata,
        occurred_at=occurred_at,
        created_at=datetime.utcnow()
    )
    
    # We apply the ON CONFLICT clause matching the partial unique index condition
    # `dedupe_key IS NOT NULL`. Note that for YulloHomeEvent dedupe_key is non-null.
    stmt = stmt.on_conflict_do_nothing(
        index_elements=['space_id', 'dedupe_key'],
    ).returning(YulloHomeEvent.id)
    
    result = await db.execute(stmt)
    inserted_id = result.scalar_one_or_none()
    
    if inserted_id is not None:
        return inserted_id
        
    # 3. If ON CONFLICT did nothing, fetch the existing ID.
    # A reused key with a different event/subject is a programming error, but
    # here we assume if it exists, it's the valid retry.
    sel_stmt = select(YulloHomeEvent.id).where(
        and_(
            YulloHomeEvent.space_id == space_id,
            YulloHomeEvent.dedupe_key == operation_key
        )
    )
    existing_id = await db.scalar(sel_stmt)
    if existing_id is None:
        raise RuntimeError("Failed to insert or fetch existing domain event")
        
    return existing_id

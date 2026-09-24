import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatSession
from app.models.conversation_event import ConversationEvent

logger = logging.getLogger(__name__)

ALLOWED_METADATA_KEYS = {
    "schema_version",
    "traffic_class", 
    "request_id", 
    "intent_origin", 
    "classifier_version",
    "classifier_score"
}


async def append_aura_event(
    db: AsyncSession, 
    *, 
    session: ChatSession, 
    event_type: str,
    operation_id: UUID, 
    message_id: UUID | None, 
    occurred_at: datetime,
    intent: str | None = None, 
    metadata: dict | None = None,
    rag_hit: bool | None = None, 
    source_count: int | None = None,
    response_ms: int | None = None, 
    error_code: str | None = None
) -> UUID:
    """
    Append an Aura-specific conversation event. Uses ON CONFLICT DO NOTHING for safe deduplication.
    """
    metadata = metadata or {}
    
    # 1. Validate metadata against allowlist
    validated_metadata = {"schema_version": 1}
    for k in ALLOWED_METADATA_KEYS:
        if k in metadata:
            validated_metadata[k] = metadata[k]
            
    if set(metadata.keys()) - ALLOWED_METADATA_KEYS:
        logger.warning(
            f"Filtered disallowed metadata keys for aura event {event_type}. "
            f"Allowed: {ALLOWED_METADATA_KEYS}, Provided: {list(metadata.keys())}"
        )

    dedupe_key = f"aura:{session.id}:{operation_id}:{event_type}"

    # 2. Insert with ON CONFLICT DO NOTHING
    stmt = insert(ConversationEvent).values(
        space_id=session.space_id,
        session_id=session.id,
        runtime_id=session.runtime_id or "aura",
        runtime_type="aura",
        chatbot_id=None,
        conversation_id=str(session.id),
        channel="web",
        message_id=message_id,
        event_type=event_type,
        intent=intent,
        rag_hit=rag_hit,
        source_count=source_count,
        response_ms=response_ms,
        error_code=error_code,
        dedupe_key=dedupe_key,
        event_metadata=validated_metadata,
        created_at=occurred_at
    )
    
    # Apply ON CONFLICT where dedupe_key is not null
    stmt = stmt.on_conflict_do_nothing(
        index_elements=['space_id', 'dedupe_key'],
        index_where=ConversationEvent.dedupe_key.isnot(None)
    ).returning(ConversationEvent.id)
    
    result = await db.execute(stmt)
    inserted_id = result.scalar_one_or_none()
    
    if inserted_id is not None:
        return inserted_id
        
    # 3. If ON CONFLICT did nothing, fetch the existing ID.
    sel_stmt = select(ConversationEvent.id).where(
        and_(
            ConversationEvent.space_id == session.space_id,
            ConversationEvent.dedupe_key == dedupe_key
        )
    )
    existing_id = await db.scalar(sel_stmt)
    if existing_id is None:
        raise RuntimeError("Failed to insert or fetch existing aura conversation event")
        
    return existing_id

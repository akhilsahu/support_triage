"""Fail-open persistence for redacted conversation lifecycle events."""

from __future__ import annotations

from uuid import UUID

import structlog

from app.core.database import AsyncSessionLocal
from app.models.conversation_event import ConversationEvent
from app.orchestra.ai.contracts import (
    ConversationEventData,
    ConversationEventType,
    ConversationExecutionContext,
)


logger = structlog.get_logger()


async def record_conversation_event(
    *,
    context: ConversationExecutionContext,
    event_type: ConversationEventType,
    data: ConversationEventData | None = None,
    message_id: UUID | None = None,
) -> bool:
    """Commit one event independently without making chat depend on analytics."""

    event_data = data or ConversationEventData()
    event = ConversationEvent(
        space_id=context.space_id,
        chatbot_id=context.chatbot_id,
        session_id=context.session_id,
        conversation_id=context.conversation_id or context.session_id_str,
        customer_id=context.customer_id,
        message_id=message_id,
        event_type=event_type.value,
        channel=context.channel.value,
        agent=event_data.agent,
        intent=event_data.intent,
        rag_hit=event_data.rag_hit,
        response_ms=event_data.response_ms,
        model=event_data.model,
        reasoning_effort=event_data.reasoning_effort,
        source_count=event_data.source_count,
        error_code=event_data.error_code,
        event_metadata=event_data.metadata,
    )

    try:
        # A dedicated session prevents an analytics commit or rollback from
        # touching the caller's customer-message or human-transfer transaction.
        async with AsyncSessionLocal() as db:
            db.add(event)
            await db.commit()
        logger.info(
            "conversation_event.recorded",
            event_type=event_type.value,
            space_id=context.space_id_str,
            chatbot_id=context.chatbot_id_str,
            session_id=context.session_id_str,
        )
        return True
    except Exception:
        logger.exception(
            "conversation_event.record_failed",
            event_type=event_type.value,
            space_id=context.space_id_str,
            chatbot_id=context.chatbot_id_str,
            session_id=context.session_id_str,
        )
        return False

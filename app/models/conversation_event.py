"""Append-only lifecycle events for production customer conversations."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class ConversationEvent(Base):
    """A redacted operational event emitted while handling a conversation."""

    __tablename__ = "conversation_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(
        UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    chatbot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chatbots.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id = Column(UUID(as_uuid=True), nullable=False)
    conversation_id = Column(String(100), nullable=False)
    customer_id = Column(UUID(as_uuid=True), nullable=True)
    message_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversation_logs.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type = Column(String(80), nullable=False)
    channel = Column(String(20), nullable=False)
    agent = Column(String(120), nullable=True)
    intent = Column(String(120), nullable=True)
    rag_hit = Column(Boolean, nullable=True)
    response_ms = Column(Integer, nullable=True)
    model = Column(String(160), nullable=True)
    reasoning_effort = Column(String(20), nullable=True)
    source_count = Column(Integer, nullable=True)
    error_code = Column(String(80), nullable=True)
    event_metadata = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_conversation_events_space_created", "space_id", "created_at"),
        Index("ix_conversation_events_session_created", "session_id", "created_at"),
        Index("ix_conversation_events_type_created", "event_type", "created_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "space_id": str(self.space_id),
            "chatbot_id": str(self.chatbot_id),
            "session_id": str(self.session_id),
            "conversation_id": self.conversation_id,
            "customer_id": str(self.customer_id) if self.customer_id else None,
            "message_id": str(self.message_id) if self.message_id else None,
            "event_type": self.event_type,
            "channel": self.channel,
            "agent": self.agent,
            "intent": self.intent,
            "rag_hit": self.rag_hit,
            "response_ms": self.response_ms,
            "model": self.model,
            "reasoning_effort": self.reasoning_effort,
            "source_count": self.source_count,
            "error_code": self.error_code,
            "metadata": self.event_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

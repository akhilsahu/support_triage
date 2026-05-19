"""
Chat session model.

ChatSession — one row per customer conversation.
`id` (UUID PK) is the session identifier — used in URLs and as the
session_id value stored in ConversationLog rows.

No separate session_id column — id IS the session id.

Redis cache key: chat:history:{str(id)}
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id          = Column(UUID(as_uuid=True),
                             ForeignKey("organizations.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    chatbot_id      = Column(UUID(as_uuid=True),
                             ForeignKey("chatbots.id", ondelete="CASCADE"),
                             nullable=True, index=True)

    # Derived from first user message
    title           = Column(String(200), nullable=True)

    # Last agent that handled a message in this session
    agent_slug      = Column(String(80), nullable=True)

    # open | closed | escalated
    status          = Column(String(20), default="open", nullable=False)

    message_count   = Column(Integer, default=0, nullable=False)
    started_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_message_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    chatbot         = relationship("Chatbot", back_populates="chat_sessions")

    __table_args__ = (
        Index("ix_chat_sessions_org_last", "org_id", "last_message_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id":              str(self.id),
            "session_id":      str(self.id),   # alias for API consumers
            "org_id":          str(self.org_id),
            "chatbot_id":      str(self.chatbot_id) if self.chatbot_id else None,
            "title":           self.title,
            "agent_slug":      self.agent_slug,
            "status":          self.status,
            "message_count":   self.message_count,
            "started_at":      self.started_at.isoformat() if self.started_at else None,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
        }

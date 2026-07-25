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

from sqlalchemy import Boolean, Column, DateTime, Integer, String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id          = Column(UUID(as_uuid=True),
                             ForeignKey("spaces.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    chatbot_id      = Column(UUID(as_uuid=True),
                             ForeignKey("chatbots.id", ondelete="CASCADE"),
                             nullable=True, index=True)

    # Logged-in customer who owns this conversation (see app/models/chatbot_user.py).
    # NULL = anonymous session (URL-id access, today's default behavior).
    chatbot_user_id = Column(UUID(as_uuid=True),
                             ForeignKey("chatbot_users.id", ondelete="SET NULL"),
                             nullable=True, index=True)

    # Derived from first user message
    title           = Column(String(200), nullable=True)

    # Last agent that handled a message in this session
    agent_slug      = Column(String(80), nullable=True)

    # open | escalated | queued | active | closed
    status          = Column(String(20), default="open", nullable=False)

    # Human transfer fields
    ai_disabled        = Column(Boolean, default=False, nullable=False)
    escalated_at       = Column(DateTime, nullable=True)
    escalation_reason  = Column(String(100), nullable=True)
    assigned_staff_id  = Column(UUID(as_uuid=True), ForeignKey("staff_members.id", ondelete="SET NULL"), nullable=True)
    claimed_at         = Column(DateTime, nullable=True)
    resolved_at        = Column(DateTime, nullable=True)

    message_count   = Column(Integer, default=0, nullable=False)
    started_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_message_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    chatbot         = relationship("Chatbot", back_populates="chat_sessions")

    __table_args__ = (
        Index("ix_chat_sessions_space_last", "space_id", "last_message_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id":              str(self.id),
            "session_id":      str(self.id),   # alias for API consumers
            "space_id":          str(self.space_id),
            "chatbot_id":      str(self.chatbot_id) if self.chatbot_id else None,
            "chatbot_user_id": str(self.chatbot_user_id) if self.chatbot_user_id else None,
            "title":           self.title,
            "agent_slug":      self.agent_slug,
            "status":          self.status,
            "message_count":   self.message_count,
            "started_at":      self.started_at.isoformat() if self.started_at else None,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
        }

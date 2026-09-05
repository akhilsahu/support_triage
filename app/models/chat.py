"""
Chat session + message thought models.

ChatSession — one row per customer conversation.
`id` (UUID PK) is the session identifier — used in URLs and as the
session_id value stored in ConversationLog rows.

No separate session_id column — id IS the session id.

MessageThought — one row per assistant ConversationLog that produced
reasoning. PK IS message_id (conversation_logs.id), so each thought is
anchored to exactly one customer-facing message.

Redis cache key: chat:history:{str(id)}
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, SmallInteger, String, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
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

    # CSAT micro-poll (migration 0055_csat)
    csat_rating  = Column(SmallInteger, nullable=True)
    csat_comment = Column(Text, nullable=True)
    csat_at      = Column(DateTime(timezone=True), nullable=True)

    # HITL clarification (ask_user) — set when the agent's last run paused on a
    # question instead of answering. All three are NULL together, or set together.
    # A new HTTP request means a new orchestrator instance with no memory of the
    # paused run's Python objects, so the requirement has to be serialized here
    # (RunRequirement.to_dict()) rather than kept in process memory. Short-lived by
    # design: cleared the moment the next message resumes the run, or on expiry —
    # see docs/structured-response-rendering-plan.md.
    pending_run_id      = Column(String(64), nullable=True)
    pending_requirement = Column(JSONB, nullable=True)
    pending_since       = Column(DateTime, nullable=True)

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


class MessageThought(Base):
    """
    Reasoning/thought text for one assistant message. One row per
    ConversationLog that produced reasoning — PK is the message's id, so a
    thought can never dangle or duplicate.

    `content` is the merged reasoning text; `segments` keeps per-delta
    granularity ({seq, content}) for faithful replay. space_id/session_id/
    chatbot_id/agent_slug are denormalized copies of the owning ConversationLog
    so analytics can filter without joining it.
    """

    __tablename__ = "message_thoughts"

    message_id       = Column(UUID(as_uuid=True),
                              ForeignKey("conversation_logs.id", ondelete="CASCADE"),
                              primary_key=True)
    space_id         = Column(UUID(as_uuid=True),
                              ForeignKey("spaces.id", ondelete="CASCADE"),
                              nullable=False, index=True)
    session_id       = Column(String(100), nullable=False, index=True)
    chatbot_id       = Column(UUID(as_uuid=True),
                              ForeignKey("chatbots.id", ondelete="SET NULL"),
                              nullable=True)
    agent_slug       = Column(String(80), nullable=True)
    # Future-proof: "reasoning" today, could become "plan"/"reflection" later.
    role             = Column(String(20), nullable=False, default="reasoning")
    content          = Column(Text, nullable=False)
    segments         = Column(JSONB, nullable=True)     # [{seq, content}] per-delta
    model            = Column(String(120), nullable=True)
    reasoning_effort = Column(String(20), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "message_id":       str(self.message_id),
            "session_id":       self.session_id,
            "chatbot_id":       str(self.chatbot_id) if self.chatbot_id else None,
            "agent_slug":       self.agent_slug,
            "role":             self.role,
            "content":          self.content,
            "segments":         self.segments,
            "model":            self.model,
            "reasoning_effort": self.reasoning_effort,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
        }

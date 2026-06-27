"""
StaffMember model.

One row per human support agent within a Space.
Staff are separate from Space owners — they log in independently
and handle escalated customer sessions via the inbox.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class StaffMember(Base):
    __tablename__ = "staff_members"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id      = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                           nullable=False, index=True)

    # Identity
    email         = Column(String(255), nullable=False, index=True)
    name          = Column(String(200), nullable=False)
    password_hash = Column(String(255), nullable=False)

    # Presence — updated by heartbeat ping every 30s
    # online: connected and accepting chats
    # offline: disconnected or no heartbeat for 90s
    presence      = Column(String(20), default="offline", nullable=False)

    # service_paused: online but not accepting new chats (wrapping up)
    service_paused = Column(Boolean, default=False, nullable=False)

    # Capacity
    max_concurrent_chats = Column(Integer, default=3, nullable=False)
    active_chat_count    = Column(Integer, default=0, nullable=False)

    # Used by LLM assignment to pick the best staff for the conversation
    description   = Column(Text, nullable=True)

    # Service hours — null means always available
    service_hours_start = Column(String(5), nullable=True)   # "HH:MM"
    service_hours_end   = Column(String(5), nullable=True)   # "HH:MM"
    timezone            = Column(String(60), default="UTC", nullable=False)

    active        = Column(Boolean, default=True, nullable=False)
    last_seen_at  = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id":                   str(self.id),
            "space_id":             str(self.space_id),
            "email":                self.email,
            "name":                 self.name,
            "presence":             self.presence,
            "service_paused":       self.service_paused,
            "max_concurrent_chats": self.max_concurrent_chats,
            "active_chat_count":    self.active_chat_count,
            "description":          self.description,
            "service_hours_start":  self.service_hours_start,
            "service_hours_end":    self.service_hours_end,
            "timezone":             self.timezone,
            "active":               self.active,
            "last_seen_at":         self.last_seen_at.isoformat() if self.last_seen_at else None,
        }

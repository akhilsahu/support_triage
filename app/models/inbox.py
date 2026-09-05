"""
Inbox models — queue, assignment history, assignment rule.

SessionWaitingQueue     — customer waiting for a staff member
SessionAssignmentHistory — every assignment event per session
SpaceAssignmentRule     — per-space config for transfer behaviour
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class SessionWaitingQueue(Base):
    """
    Customer sessions waiting for an available staff member.

    position: insertion order (never changes)
    priority: higher number = served sooner (default 0, can be boosted)
    Queue position at runtime = count of entries ahead by priority+position.
    """
    __tablename__ = "session_waiting_queue"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id   = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"),
                        nullable=False, unique=True, index=True)

    position   = Column(Integer, nullable=False)   # insertion order
    priority   = Column(Integer, default=0, nullable=False)  # higher = sooner

    # waiting | assigned | expired
    status     = Column(String(20), default="waiting", nullable=False, index=True)

    queued_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    assigned_at = Column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id":          str(self.id),
            "session_id":  str(self.session_id),
            "position":    self.position,
            "priority":    self.priority,
            "status":      self.status,
            "queued_at":   self.queued_at.isoformat() if self.queued_at else None,
            "expires_at":  self.expires_at.isoformat() if self.expires_at else None,
        }


class SessionAssignmentHistory(Base):
    """
    Every time a session is assigned to (or released from) a staff member.
    Used for history-priority selection — find the last staff who served this customer.
    """
    __tablename__ = "session_assignment_history"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id     = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    staff_id       = Column(UUID(as_uuid=True), ForeignKey("staff_members.id", ondelete="SET NULL"),
                            nullable=True, index=True)

    # rule | ai_escalation | manual | transfer
    source         = Column(String(30), nullable=False)

    assigned_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    released_at    = Column(DateTime, nullable=True)
    # transferred | resolved | staff_offline
    release_reason = Column(String(50), nullable=True)


class SpaceAssignmentRule(Base):
    """
    Per-space configuration for how transfers and queues work.
    One row per space (created on first access with defaults).
    """
    __tablename__ = "space_assignment_rules"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id    = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                         nullable=False, unique=True, index=True)

    # Assignment behaviour
    auto_assign_on_first_message = Column(Boolean, default=False, nullable=False)
    llm_assignment_enabled       = Column(Boolean, default=False, nullable=False)
    history_priority_enabled     = Column(Boolean, default=True, nullable=False)

    # Queue
    queue_wait_timeout_minutes   = Column(Integer, default=30, nullable=False)

    # Notifications
    notification_email           = Column(String(255), nullable=True)

    # Messages shown to customer
    queue_message   = Column(Text, default="You're in the queue. A team member will be with you shortly.")
    no_staff_message = Column(Text, default="Our team is currently unavailable. Please try again later.")

    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id":                           str(self.id),
            "space_id":                     str(self.space_id),
            "auto_assign_on_first_message": self.auto_assign_on_first_message,
            "llm_assignment_enabled":       self.llm_assignment_enabled,
            "history_priority_enabled":     self.history_priority_enabled,
            "queue_wait_timeout_minutes":   self.queue_wait_timeout_minutes,
            "notification_email":           self.notification_email,
            "queue_message":                self.queue_message,
            "no_staff_message":             self.no_staff_message,
        }


class CannedReply(Base):
    """
    Per-space canned (quick) replies for inbox agents.

    A short `label` shown in the picker + the full `body` text inserted
    into the reply box. Space-scoped so each business controls its own
    templates. No personalization placeholders yet — plain text.
    """
    __tablename__ = "canned_replies"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id   = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    label      = Column(String(80), nullable=False)
    body       = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id":         str(self.id),
            "space_id":    str(self.space_id),
            "label":       self.label,
            "body":        self.body,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }

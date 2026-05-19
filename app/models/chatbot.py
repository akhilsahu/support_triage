"""
Chatbot model.

Chatbot — one row per chatbot within an organization.
Each org has one default chatbot (is_default=True) created at registration.
Future chatbots are non-default and can be enabled per org plan.

URL routing: domain/<org_slug>  → org's default chatbot
Future:      domain/<org_slug>/<chatbot_slug> → specific chatbot
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Chatbot(Base):
    """One chatbot per row; an org can have many chatbots."""

    __tablename__ = "chatbots"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id       = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"),
                          nullable=False, index=True)

    # Unique within org; used in future multi-bot URL routing
    slug         = Column(String(80), nullable=False)
    display_name = Column(String(200), nullable=False)
    description  = Column(Text, default="")

    # Per-chatbot branding (falls back to org branding if null)
    logo_url     = Column(String(500), nullable=True)
    theme_color  = Column(String(20), nullable=True)

    # The default chatbot is the one used for /{org_slug} routing
    is_default   = Column(Boolean, default=False, nullable=False)
    active       = Column(Boolean, default=True, nullable=False)

    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    org           = relationship("Organization", back_populates="chatbots")
    agent_definitions = relationship("AgentDefinition", back_populates="chatbot",
                                     cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="chatbot",
                                 cascade="all, delete-orphan")

    __table_args__ = (
        # slug unique within an org
        Index("ix_chatbot_org_slug", "org_id", "slug", unique=True),
    )

    def to_dict(self) -> dict:
        return {
            "id":           str(self.id),
            "org_id":       str(self.org_id),
            "slug":         self.slug,
            "display_name": self.display_name,
            "description":  self.description,
            "logo_url":     self.logo_url,
            "theme_color":  self.theme_color,
            "is_default":   self.is_default,
            "active":       self.active,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }

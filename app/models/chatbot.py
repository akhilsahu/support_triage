"""
Chatbot model.

Chatbot — one row per chatbot within an organization.
Each space has one default chatbot (is_default=True) created at registration.
Future chatbots are non-default and can be enabled per space plan.

URL routing: domain/<slug>  → space's default chatbot
Future:      domain/<org_slug>/<chatbot_slug> → specific chatbot
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Chatbot(Base):
    """One chatbot per row; a space can have many chatbots."""

    __tablename__ = "chatbots"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id       = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                          nullable=False, index=True)

    # Public API key — used to auth the embeddable widget without exposing slug
    api_key      = Column(String(36), unique=True, nullable=True, index=True,
                          default=lambda: str(uuid.uuid4()))

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

    # Human transfer settings
    human_transfer_enabled = Column(Boolean, default=True, nullable=False)
    human_transfer_message = Column(Text, default="You're being connected to a human agent. Please hold on.")

    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    space                  = relationship("Space", back_populates="chatbots")
    builtin_agent_configs = relationship("SpaceBuiltinAgentConfig", back_populates="chatbot",
                                          cascade="all, delete-orphan")
    custom_agent_links   = relationship("ChatbotCustomAgent", back_populates="chatbot",
                                        cascade="all, delete-orphan")
    chat_sessions        = relationship("ChatSession", back_populates="chatbot",
                                        cascade="all, delete-orphan")

    __table_args__ = (
        # slug unique within an org
        Index("ix_chatbot_space_slug", "space_id", "slug", unique=True),
    )

    def to_dict(self) -> dict:
        return {
            "id":           str(self.id),
            "space_id":       str(self.space_id),
            "api_key":      self.api_key,
            "slug":         self.slug,
            "display_name": self.display_name,
            "description":  self.description,
            "logo_url":     self.logo_url,
            "theme_color":  self.theme_color,
            "is_default":              self.is_default,
            "active":                  self.active,
            "human_transfer_enabled":  self.human_transfer_enabled,
            "human_transfer_message":  self.human_transfer_message,
            "created_at":              self.created_at.isoformat() if self.created_at else None,
        }

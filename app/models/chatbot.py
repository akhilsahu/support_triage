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

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, ForeignKey, Index
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
    show_logo    = Column(Boolean, default=True, nullable=False)

    # The default chatbot is the one used for /{org_slug} routing
    is_default   = Column(Boolean, default=False, nullable=False)
    active       = Column(Boolean, default=True, nullable=False)

    # Human transfer settings
    human_transfer_enabled = Column(Boolean, default=True, nullable=False)
    human_transfer_message = Column(Text, default="You're being connected to a human agent. Please hold on.")

    # Admin override for the AI-recommended homepage empty-state sections.
    # NULL = defer to the renderengine's AI recommendation. JSON shape:
    # {"sections": ["hero", "faq", ...], "overrides": {"promo": {"text": "..."}}}
    homepage_sections_override = Column(Text, nullable=True)

    # Master switch for the pluggable homepage-sections renderer (admin-config
    # driven only -- no env var/build flag anywhere). False (default) = the
    # original hardcoded hero+chips empty state, unchanged. True = the
    # renderengine composes the empty state (AI recommendation, or the
    # override above when set).
    homepage_sections_enabled = Column(Boolean, default=False, nullable=False)

    # Admin-authored quick-topic buttons for the homepage 'quick_topics'
    # section. JSON list: [{"label": "Term Insurance", "prompt": "..."}].
    # NULL/empty = section doesn't render (see app/renderengine/quick_topics.py).
    # Not AI-generated -- same treatment as homepage_sections_override's "promo".
    quick_topics = Column(Text, nullable=True)

    # Admin-authored trust badges for the homepage 'trust_badges' section.
    # JSON list of short strings (e.g. ["IRDAI Registered", "4.8★ Rating"]).
    # NULL/empty = section doesn't render. Not AI-generated -- same treatment
    # as quick_topics/promo. See app/renderengine/trust_badges.py.
    trust_badges = Column(Text, nullable=True)

    # Admin-authored trust metrics for the homepage 'stat_band' section live in
    # their own table (chatbot_stat_metrics) -- one row per {value,label}. No
    # rows = the section falls back to the AI/web generator. See stat_metrics
    # relationship below and app/renderengine/stat_band.py.

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
    stat_metrics         = relationship("ChatbotStatMetric", back_populates="chatbot",
                                        cascade="all, delete-orphan",
                                        order_by="ChatbotStatMetric.position")

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
            "show_logo":    self.show_logo,
            "is_default":              self.is_default,
            "active":                  self.active,
            "human_transfer_enabled":  self.human_transfer_enabled,
            "human_transfer_message":  self.human_transfer_message,
            "homepage_sections_override": self.homepage_sections_override,
            "homepage_sections_enabled":  self.homepage_sections_enabled,
            "quick_topics":               self.quick_topics,
            "trust_badges":               self.trust_badges,
            "created_at":              self.created_at.isoformat() if self.created_at else None,
        }


class ChatbotStatMetric(Base):
    """
    One admin-authored trust metric for a chatbot's homepage 'stat_band'
    section (e.g. value="99.5%", label="Claims settled"). Optional: a chatbot
    with no rows falls back to the AI/web-generated stat band.
    """

    __tablename__ = "chatbot_stat_metrics"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chatbot_id = Column(UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    value      = Column(String(20), nullable=False)
    label      = Column(String(40), nullable=False)
    position   = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    chatbot = relationship("Chatbot", back_populates="stat_metrics")

    def to_dict(self) -> dict:
        return {"id": str(self.id), "value": self.value, "label": self.label, "position": self.position}

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
from sqlalchemy.dialects.postgresql import UUID, JSONB
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

    # Owner toggle for asking the customer which product they mean instead of
    # guessing or answering for all products (Agno UserFeedbackTools / ask_user).
    # Default off: chatbots that haven't opted in keep today's answer-for-all
    # behavior unchanged. Gates whether the tool is attached at all; whether a
    # given agent actually gets it also depends on it having 2+ products — see
    # AgentFactory._build_tools and docs/ambiguous-question-clarification-plan.md.
    clarify_enabled = Column(Boolean, default=True, nullable=False)

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

    # Customer-login gate for this chatbot (see app/models/chatbot_user.py):
    #   NULL -> login never required (default, today's anonymous behavior)
    #   0    -> login required before the first message
    #   N>0  -> N free messages, then login required to continue
    login_after_messages = Column(Integer, nullable=True)

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

    # Per-chatbot LLM override: which model answers this bot's customers, and
    # whether it reasons out loud first (chain-of-thought). NULL = inherit the
    # env-configured default (AgnoConfig.llm_model / reasoning_effort). This is
    # the chatbot-level default every agent falls back to unless it sets its
    # own llm_model/reasoning_effort (see ResolvedAgent + LLMFactory.build).
    llm_model         = Column(String(120), nullable=True)
    reasoning_effort  = Column(String(20), nullable=True)

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
    comparison           = relationship("ChatbotComparison", back_populates="chatbot",
                                        cascade="all, delete-orphan", uselist=False)
    homepage_snapshot    = relationship("ChatbotHomepageSnapshot", back_populates="chatbot",
                                        cascade="all, delete-orphan", uselist=False)

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
            "clarify_enabled":         self.clarify_enabled,
            "homepage_sections_override": self.homepage_sections_override,
            "homepage_sections_enabled":  self.homepage_sections_enabled,
            "login_after_messages":       self.login_after_messages,
            "quick_topics":               self.quick_topics,
            "trust_badges":               self.trust_badges,
            "llm_model":                  self.llm_model,
            "reasoning_effort":           self.reasoning_effort,
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


class ChatbotHomepageSnapshot(Base):
    """
    A frozen, admin-curated snapshot of a chatbot's pre-chat welcome UI.

    Two payloads, one row per chatbot:
      - draft_payload: the working copy the admin generates, edits and previews.
      - published_payload: what the public endpoint serves verbatim (skipping
        all live LLM/web generation). NULL = not published -> the endpoint falls
        back to today's live (Redis-cached) generation path.

    Publishing copies draft -> published, so editing/regenerating a draft never
    disturbs the live UI until the admin publishes again. Each payload is the
    full assembled welcome response (homepage_sections + every section's content
    + frozen suggestion chips + hero description) -- the same shape
    app/api/space.py's org_public_info returns, so serving is a direct merge.
    """

    __tablename__ = "chatbot_homepage_snapshot"

    chatbot_id        = Column(UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="CASCADE"),
                               primary_key=True)
    draft_payload     = Column(JSONB, nullable=True)   # working copy (generate/edit/preview)
    published_payload = Column(JSONB, nullable=True)   # served to customers; NULL = not published
    generated_at      = Column(DateTime, nullable=True)   # last live generation into the draft
    published_at      = Column(DateTime, nullable=True)
    published_by      = Column(UUID(as_uuid=True), nullable=True)  # space user who published
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    chatbot = relationship("Chatbot", back_populates="homepage_snapshot")

    @property
    def is_published(self) -> bool:
        return self.published_payload is not None

    def to_dict(self) -> dict:
        return {
            "published":    self.is_published,
            "draft_payload":     self.draft_payload,
            "published_payload": self.published_payload,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }


class ChatbotComparison(Base):
    """
    One admin-authored competitor comparison grid per chatbot (columns + rows +
    an optional source/date caption). Optional: a chatbot with no row falls back
    to the AI/web-generated comparison. Admin figures are the brand's OWN
    verified/cited data -- the compliance-safe source for comparative claims.
    """

    __tablename__ = "chatbot_comparison"

    chatbot_id = Column(UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="CASCADE"),
                        primary_key=True)
    columns    = Column(JSONB, nullable=False)   # ["Plan", "Claim ratio", "Premium/mo"]
    rows       = Column(JSONB, nullable=False)   # [["HDFC Life", "99.5%", "₹16/day"], ...]
    source     = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    chatbot = relationship("Chatbot", back_populates="comparison")

    def to_dict(self) -> dict:
        return {"columns": self.columns, "rows": self.rows, "source": self.source or ""}

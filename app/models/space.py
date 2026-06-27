"""
Brand, agent tables, PromptSkill, ConversationLog models.

Organization          — tenant account (each brand/client has one row).
BuiltinAgentCatalog   — platform-level built-in agent definitions (super admin owned).
SpaceBuiltinAgentConfig — per-org opt-in + overrides for built-in agents (Factor 1 + Factor 2).
CustomAgent           — org-created custom agents (fully org-scoped).
PromptSkill           — reusable prompt fragments a brand attaches to agents.
ConversationLog       — every customer message for analytics.
"""

import uuid
import json
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, Integer,
    String, Text, ForeignKey, Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


# ── Brand ─────────────────────────────────────────────────────────────────────

class Space(Base):
    """One row per registered brand / tenant."""

    __tablename__ = "spaces"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug         = Column(String(80), unique=True, nullable=False, index=True)
    display_name = Column(String(200), nullable=False)
    email        = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    # Email verification
    email_verified              = Column(Boolean, default=False, nullable=False)
    email_verification_token    = Column(String(255), nullable=True, index=True)
    email_verification_expires  = Column(DateTime, nullable=True)

    # Password reset
    password_reset_token   = Column(String(255), nullable=True, index=True)
    password_reset_expires = Column(DateTime, nullable=True)

    # JWT revocation — increment to invalidate all existing tokens for this space
    token_version = Column(Integer, default=1, nullable=False)

    # White-label customisation
    logo_url     = Column(String(500), nullable=True)
    theme_color  = Column(String(20), default="#6366f1")   # indigo-500

    # Plan / status
    plan               = Column(String(50), default="free")
    active             = Column(Boolean, default=True, nullable=False)
    show_rag_citations = Column(Boolean, default=False, nullable=False)

    # Nav — null means "use system-wide defaults"; a JSON list restricts to those items
    enabled_nav_items  = Column(Text, nullable=True)   # JSON list of nav item IDs

    onboarding_complete = Column(Boolean, default=False, nullable=False)

    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    chatbots               = relationship("Chatbot", back_populates="space",
                                          cascade="all, delete-orphan")
    builtin_agent_configs  = relationship("SpaceBuiltinAgentConfig", back_populates="space",
                                          cascade="all, delete-orphan")
    custom_agents          = relationship("CustomAgent", back_populates="space",
                                          cascade="all, delete-orphan")   # org-level ownership
    prompt_skills          = relationship("PromptSkill", back_populates="space",
                                          cascade="all, delete-orphan")
    conversation_logs      = relationship("ConversationLog", back_populates="space",
                                          cascade="all, delete-orphan")
    documents              = relationship("Document", back_populates="space",
                                          cascade="all, delete-orphan")
    data_sources           = relationship("SpaceDataSource", back_populates="space",
                                          cascade="all, delete-orphan")
    knowledge_bases        = relationship("KnowledgeBase", back_populates="space",
                                          cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id":           str(self.id),
            "slug":         self.slug,
            "display_name": self.display_name,
            "email":        self.email,
            "logo_url":     self.logo_url,
            "theme_color":  self.theme_color,
            "plan":         self.plan,
            "active":               self.active,
            "show_rag_citations":   self.show_rag_citations,
            "onboarding_complete":  self.onboarding_complete,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
        }


# ── PromptSkill ───────────────────────────────────────────────────────────────

class PromptSkill(Base):
    """
    A reusable prompt fragment that can be attached to one or more agents.

    skill_type controls how the skill is applied at runtime:
      "instruction"  — appended to system prompt as a directive
      "context"      — prepended to the user message as context
      "format"       — appended as a formatting instruction
      "rag_filter"   — adds a doc_type filter to the RAG query
    """

    __tablename__ = "prompt_skills"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id     = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                          nullable=False, index=True)

    name         = Column(String(200), nullable=False)
    description  = Column(Text, default="")
    skill_type   = Column(String(50), default="instruction")
    prompt_text  = Column(Text, nullable=False)
    active       = Column(Boolean, default=True, nullable=False)

    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", back_populates="prompt_skills")

    def to_dict(self) -> dict:
        return {
            "id":          str(self.id),
            "space_id":    str(self.space_id),
            "name":        self.name,
            "description": self.description,
            "skill_type":  self.skill_type,
            "prompt_text": self.prompt_text,
            "active":      self.active,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
        }


# ── ConversationLog ───────────────────────────────────────────────────────────

class ConversationLog(Base):
    """Every customer message + AI response, used for analytics."""

    __tablename__ = "conversation_logs"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id        = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    chatbot_id    = Column(UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="SET NULL"),
                             nullable=True, index=True)
    session_id      = Column(String(100), nullable=False, index=True)

    role            = Column(String(20), nullable=False)   # "user" | "assistant"
    message         = Column(Text, nullable=False)

    intent          = Column(String(80), nullable=True)
    agent_slug      = Column(String(80), nullable=True)
    rag_hit         = Column(Boolean, nullable=True)
    sentiment_score = Column(Float, nullable=True)
    response_ms     = Column(Integer, nullable=True)   # latency in ms

    timestamp       = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    space = relationship("Space", back_populates="conversation_logs")

    __table_args__ = (
        Index("ix_conv_log_space_ts", "space_id", "timestamp"),
    )


# ── BuiltinAgentCatalog ───────────────────────────────────────────────────────

class BuiltinAgentCatalog(Base):
    """
    Platform-level catalog of built-in agent types.
    One row per agent type — owned by super admin.

    platform_enabled (Factor 1): super admin gates global availability.
    locked:                       cannot be disabled (e.g. triage).
    """

    __tablename__ = "builtin_agent_catalog"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug         = Column(String(80), unique=True, nullable=False)
    agent_type   = Column(String(80), unique=True, nullable=False)
    name         = Column(String(200), nullable=False)
    description  = Column(Text, default="")
    icon         = Column(String(20), default="🤖")

    # Platform guardrail prompt (hidden from orgs)
    base_prompt          = Column(Text, default="")
    default_temperature  = Column(Float, default=0.4)
    default_max_tokens   = Column(Integer, default=500)
    default_rag_enabled  = Column(Boolean, default=False)
    default_rag_doc_types = Column(String(500), default="")
    default_rag_top_k    = Column(Integer, default=5)

    # Factor 1: super admin global switch
    platform_enabled = Column(Boolean, default=False, nullable=False)
    # Locked agents (triage) can never be disabled by anyone
    locked           = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    org_configs = relationship("SpaceBuiltinAgentConfig", back_populates="catalog",
                               cascade="all, delete-orphan")

    @property
    def default_rag_doc_types_list(self) -> list:
        return [d.strip() for d in (self.default_rag_doc_types or "").split(",") if d.strip()]


# ── SpaceBuiltinAgentConfig ─────────────────────────────────────────────────────

class SpaceBuiltinAgentConfig(Base):
    """
    Per-org opt-in and customisation of a built-in agent.

    enabled (Factor 2): org admin toggles this themselves.
    An agent is visible/usable only when:
        catalog.platform_enabled = True  (Factor 1)
        AND config.enabled = True        (Factor 2)
    """

    __tablename__ = "space_builtin_agent_configs"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id     = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    chatbot_id = Column(UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    catalog_id = Column(UUID(as_uuid=True), ForeignKey("builtin_agent_catalog.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    # Factor 2: chatbot-level toggle
    enabled = Column(Boolean, default=False, nullable=False)

    # Chatbot overrides (NULL = use catalog default)
    system_prompt = Column(Text, default="")
    temperature   = Column(Float, nullable=True)
    max_tokens    = Column(Integer, nullable=True)
    rag_enabled   = Column(Boolean, nullable=True)
    rag_doc_types = Column(String(500), nullable=True)
    rag_top_k     = Column(Integer, nullable=True)
    keywords_json = Column(Text, default="[]")
    skills_json   = Column(Text, default="[]")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", back_populates="builtin_agent_configs")
    chatbot = relationship("Chatbot", back_populates="builtin_agent_configs")
    catalog = relationship("BuiltinAgentCatalog", back_populates="org_configs")

    __table_args__ = (
        Index("uq_chatbot_builtin_config", "chatbot_id", "catalog_id", unique=True),
    )

    @property
    def effective_temperature(self) -> float:
        return self.temperature if self.temperature is not None else self.catalog.default_temperature

    @property
    def effective_max_tokens(self) -> int:
        return self.max_tokens if self.max_tokens is not None else self.catalog.default_max_tokens

    @property
    def effective_rag_enabled(self) -> bool:
        return self.rag_enabled if self.rag_enabled is not None else self.catalog.default_rag_enabled

    @property
    def effective_rag_doc_types_list(self) -> list:
        raw = self.rag_doc_types if self.rag_doc_types is not None else self.catalog.default_rag_doc_types
        return [d.strip() for d in (raw or "").split(",") if d.strip()]

    @property
    def effective_rag_top_k(self) -> int:
        return self.rag_top_k if self.rag_top_k is not None else self.catalog.default_rag_top_k

    @property
    def keywords_list(self) -> list:
        try: return json.loads(self.keywords_json or "[]")
        except Exception: return []

    @property
    def skills_list(self) -> list:
        try: return json.loads(self.skills_json or "[]")
        except Exception: return []


# ── CustomAgent ───────────────────────────────────────────────────────────────

class CustomAgent(Base):
    """
    Org-scoped custom agent definition.
    Chatbot linkage is via chatbot_custom_agents (many-to-many junction).
    """

    __tablename__ = "custom_agents"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id      = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                         nullable=False, index=True)

    slug        = Column(String(80), nullable=False)
    name        = Column(String(200), nullable=False)
    description = Column(Text, default="")
    icon        = Column(String(20), default="🤖")

    system_prompt = Column(Text, default="")
    temperature   = Column(Float, default=0.4)
    max_tokens    = Column(Integer, default=500)
    rag_enabled   = Column(Boolean, default=False)
    rag_doc_types = Column(String(500), default="")
    rag_top_k     = Column(Integer, default=5)
    keywords_json = Column(Text, default="[]")
    skills_json   = Column(Text, default="[]")
    active        = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    space           = relationship("Space", back_populates="custom_agents")
    knowledge_bases = relationship("AgentKnowledgeBase", back_populates="agent",
                                   cascade="all, delete-orphan")
    chatbot_links   = relationship("ChatbotCustomAgent", back_populates="agent",
                                 cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_custom_agent_space_slug", "space_id", "slug", unique=True),
    )

    @property
    def rag_doc_types_list(self) -> list:
        return [d.strip() for d in (self.rag_doc_types or "").split(",") if d.strip()]

    @property
    def keywords_list(self) -> list:
        try: return json.loads(self.keywords_json or "[]")
        except Exception: return []

    @property
    def skills_list(self) -> list:
        try: return json.loads(self.skills_json or "[]")
        except Exception: return []

    def to_dict(self) -> dict:
        return {
            "id":            str(self.id),
            "space_id":        str(self.space_id),
            "slug":          self.slug,
            "name":          self.name,
            "description":   self.description,
            "agent_type":    "custom",
            "icon":          self.icon,
            "is_builtin":    False,
            "active":        self.active,
            "system_prompt": self.system_prompt,
            "temperature":   self.temperature,
            "max_tokens":    self.max_tokens,
            "rag_enabled":   self.rag_enabled,
            "rag_doc_types": self.rag_doc_types_list,
            "rag_top_k":     self.rag_top_k,
            "keywords":      self.keywords_list,
            "kb_ids":        [str(lnk.kb_id) for lnk in self.knowledge_bases] if self.knowledge_bases else [],
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }


# ── ChatbotCustomAgent ────────────────────────────────────────────────────────

class ChatbotCustomAgent(Base):
    """
    Many-to-many junction: one custom agent can be used by multiple chatbots,
    and one chatbot can use multiple custom agents.
    """

    __tablename__ = "chatbot_custom_agents"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chatbot_id = Column(UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    agent_id   = Column(UUID(as_uuid=True), ForeignKey("custom_agents.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    chatbot = relationship("Chatbot", back_populates="custom_agent_links")
    agent   = relationship("CustomAgent", back_populates="chatbot_links")

    __table_args__ = (
        Index("uq_chatbot_custom_agent", "chatbot_id", "agent_id", unique=True),
    )


# ── AgentMetaSuggestion ───────────────────────────────────────────────────────

class AgentMetaSuggestion(Base):
    """
    LLM-generated placeholder metadata for a new custom agent.

    Cached per org + doc_type_key so repeated "Create Agent" clicks for the
    same document types reuse the stored suggestion without hitting the LLM again.

    agent_id is null until the user actually creates the agent; once created it
    points to the resulting CustomAgent row.
    """

    __tablename__ = "agent_meta_suggestions"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id        = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    agent_id      = Column(UUID(as_uuid=True), ForeignKey("agent_definitions.id", ondelete="SET NULL"),
                           nullable=True, index=True)

    # Cache keys
    # doc_id:       specific doc this suggestion was generated for ("" = type-only)
    # doc_type_key: sorted, comma-joined doc_types e.g. "manual,policy"
    doc_id        = Column(String(500), nullable=False, default="")
    doc_type_key  = Column(String(500), nullable=False)

    # LLM-generated fields (user may edit before saving to agent_definitions)
    name          = Column(String(200), nullable=False)
    description   = Column(Text, default="")
    system_prompt = Column(Text, default="")

    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_agent_meta_suggestion_space_doc_type", "space_id", "doc_id", "doc_type_key", unique=True),
    )

    def to_dict(self) -> dict:
        return {
            "id":            str(self.id),
            "space_id":        str(self.space_id),
            "agent_id":      str(self.agent_id) if self.agent_id else None,
            "doc_id":        self.doc_id,
            "doc_type_key":  self.doc_type_key,
            "name":          self.name,
            "description":   self.description,
            "system_prompt": self.system_prompt,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }


# ── PlatformSettings ──────────────────────────────────────────────────────────

# All available nav item IDs — used as the master list for system-wide defaults.
ALL_NAV_ITEMS = [
    "dashboard", "chat", "agents", "knowledge-base",
    "analytics", "inbox", "data-sources", "settings",
]

class PlatformSettings(Base):
    """
    Singleton table — exactly one row, created on first access.
    Stores system-wide configuration controlled by the super admin.

    nav_config: JSON dict  { nav_item_id: bool }
    Null or missing key means enabled by default.
    """

    __tablename__ = "platform_settings"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nav_config = Column(Text, nullable=True)   # JSON dict {id: bool}
    active_homepage = Column(String(50), default="homepage1", server_default="homepage1")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_nav_config(self) -> dict:
        """Returns {nav_id: bool} with all ALL_NAV_ITEMS present."""
        base = {k: True for k in ALL_NAV_ITEMS}
        if self.nav_config:
            try:
                base.update(json.loads(self.nav_config))
            except Exception:
                pass
        return base

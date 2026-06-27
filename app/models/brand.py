"""
Brand, AgentDefinition, PromptSkill, ConversationLog models.

Brand         — tenant account (each brand/client has one row).
AgentDefinition — per-brand agent config; built-in agents are seeded at
                  registration (active=False); brands toggle them on/off
                  or create custom agents.
PromptSkill   — reusable prompt fragments a brand attaches to agents.
ConversationLog — every customer message for analytics.
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

class Organization(Base):
    """One row per registered brand / tenant."""

    __tablename__ = "organizations"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug         = Column(String(80), unique=True, nullable=False, index=True)
    display_name = Column(String(200), nullable=False)
    email        = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    # White-label customisation
    logo_url     = Column(String(500), nullable=True)
    theme_color  = Column(String(20), default="#6366f1")   # indigo-500

    # Plan / status
    plan         = Column(String(50), default="free")
    active       = Column(Boolean, default=True, nullable=False)

    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    agent_definitions = relationship("AgentDefinition", back_populates="org",
                                     cascade="all, delete-orphan")
    prompt_skills     = relationship("PromptSkill", back_populates="org",
                                     cascade="all, delete-orphan")
    conversation_logs = relationship("ConversationLog", back_populates="org",
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
            "active":       self.active,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }


# ── AgentDefinition ────────────────────────────────────────────────────────────

class AgentDefinition(Base):
    """
    Per-brand agent configuration.

    Built-in agents (is_builtin=True) are seeded automatically at brand
    registration with active=False.  Brands flip `active` to enable them.

    Custom agents (is_builtin=False) are created by the brand and executed
    by DynamicAgentExecutor.

    `skills_json` stores a JSON list of PromptSkill IDs to compose into
    the agent's prompt at runtime.
    """

    __tablename__ = "agent_definitions"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id     = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"),
                          nullable=False, index=True)

    slug         = Column(String(80), nullable=False)   # e.g. "finance", "my_warranty_bot"
    name         = Column(String(200), nullable=False)
    description  = Column(Text, default="")
    agent_type   = Column(String(80), nullable=False)   # "finance"|"logistics"|"order"|
                                                         # "tech_support"|"triage"|"custom"
    icon         = Column(String(20), default="🤖")

    # Built-in flag — prevents deletion; only toggling allowed
    is_builtin   = Column(Boolean, default=False, nullable=False)
    active       = Column(Boolean, default=False, nullable=False)

    # LLM parameters
    system_prompt = Column(Text, default="")
    temperature   = Column(Float, default=0.4)
    max_tokens    = Column(Integer, default=500)

    # RAG configuration
    rag_enabled   = Column(Boolean, default=False)
    # Comma-separated doc_types to query: "tech_support,manual"
    rag_doc_types = Column(String(500), default="")
    rag_top_k     = Column(Integer, default=5)

    # Ordered list of PromptSkill IDs (stored as JSON array string)
    skills_json   = Column(Text, default="[]")

    # Routing keywords (fallback if LLM classification fails)
    keywords_json = Column(Text, default="[]")

    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    brand = relationship("Organization", back_populates="agent_definitions")

    __table_args__ = (
        # slug must be unique within a brand
        Index("ix_agent_def_brand_slug", "space_id", "slug", unique=True),
    )

    @property
    def rag_doc_types_list(self) -> list:
        return [d.strip() for d in self.rag_doc_types.split(",") if d.strip()]

    @property
    def skills_list(self) -> list:
        try: return json.loads(self.skills_json)
        except Exception: return []

    @property
    def keywords_list(self) -> list:
        try: return json.loads(self.keywords_json)
        except Exception: return []

    def to_dict(self) -> dict:
        return {
            "id":            str(self.id),
            "space_id":      str(self.space_id),
            "slug":          self.slug,
            "name":          self.name,
            "description":   self.description,
            "agent_type":    self.agent_type,
            "icon":          self.icon,
            "is_builtin":    self.is_builtin,
            "active":        self.active,
            "system_prompt": self.system_prompt,
            "temperature":   self.temperature,
            "max_tokens":    self.max_tokens,
            "rag_enabled":   self.rag_enabled,
            "rag_doc_types": self.rag_doc_types_list,
            "rag_top_k":     self.rag_top_k,
            "skills":        self.skills_list,
            "keywords":      self.keywords_list,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
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
    space_id     = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"),
                          nullable=False, index=True)

    name         = Column(String(200), nullable=False)
    description  = Column(Text, default="")
    skill_type   = Column(String(50), default="instruction")
    prompt_text  = Column(Text, nullable=False)
    active       = Column(Boolean, default=True, nullable=False)

    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    brand = relationship("Organization", back_populates="prompt_skills")

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
    space_id        = Column(UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    session_id      = Column(String(100), nullable=False, index=True)

    role            = Column(String(20), nullable=False)   # "user" | "assistant"
    message         = Column(Text, nullable=False)

    intent          = Column(String(80), nullable=True)
    agent_slug      = Column(String(80), nullable=True)
    rag_hit         = Column(Boolean, nullable=True)
    sentiment_score = Column(Float, nullable=True)
    response_ms     = Column(Integer, nullable=True)   # latency in ms

    timestamp       = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    brand = relationship("Organization", back_populates="conversation_logs")

    __table_args__ = (
        Index("ix_conv_log_brand_ts", "space_id", "timestamp"),
    )

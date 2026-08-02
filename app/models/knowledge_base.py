"""
KnowledgeBase — named collection of knowledge items scoped to a Space.

KnowledgeBase       — container (e.g. "Product FAQ", "Tech Docs")
KnowledgeBaseItem   — one entry: a doc reference, raw text, or Q&A pair
AgentKnowledgeBase  — M2M: custom agent → knowledge base(s)

item_type values:
  "doc"  — references a ChromaDB-indexed document by doc_id
  "text" — raw text chunk stored inline (also indexed in ChromaDB)
  "qna"  — question + answer pair (also indexed in ChromaDB)
"""

from __future__ import annotations
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class KnowledgeBase(Base):
    """Named knowledge collection belonging to a Space."""

    __tablename__ = "knowledge_bases"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id    = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text, default="")
    active      = Column(Boolean, default=True, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    space       = relationship("Space", back_populates="knowledge_bases")
    items       = relationship("KnowledgeBaseItem", back_populates="kb",
                               cascade="all, delete-orphan")
    agent_links = relationship("AgentKnowledgeBase", back_populates="kb",
                               cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_kb_space", "space_id"),
    )

    def to_dict(self) -> dict:
        return {
            "id":          str(self.id),
            "space_id":    str(self.space_id),
            "name":        self.name,
            "description": self.description,
            "active":      self.active,
            "item_count":  len(self.items) if self.items else 0,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }


class KnowledgeBaseItem(Base):
    """
    One item inside a KnowledgeBase.

    item_type = "doc"  → doc_id points to ChromaDB-indexed file
    item_type = "url"  → scraped web page; doc_id as for "doc", content holds
                         the source URL. Same chunks as a file — the separate
                         type exists so the dashboard can list web pages apart
                         from uploads (and link back to the live page).
    item_type = "text" → content holds raw text; indexed on ingest
    item_type = "qna"  → question + content (answer); indexed on ingest
    """

    __tablename__ = "knowledge_base_items"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kb_id      = Column(UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    item_type  = Column(String(20), nullable=False)   # doc | text | qna
    title      = Column(String(500), nullable=True)

    # "doc" fields
    doc_id     = Column(String(500), nullable=True)   # ChromaDB doc_id

    # "text" / "qna" fields
    question   = Column(Text, nullable=True)          # qna only
    content    = Column(Text, nullable=True)          # text body or qna answer

    # Once text/qna is indexed in ChromaDB this stores the generated doc_id
    indexed_doc_id = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    kb = relationship("KnowledgeBase", back_populates="items")

    __table_args__ = (
        Index("ix_kb_item_kb", "kb_id"),
        Index("ix_kb_item_type", "item_type"),
    )

    def to_dict(self) -> dict:
        return {
            "id":             str(self.id),
            "kb_id":          str(self.kb_id),
            "item_type":      self.item_type,
            "title":          self.title,
            "doc_id":         self.doc_id,
            "question":       self.question,
            "content":        self.content,
            "indexed_doc_id": self.indexed_doc_id,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
        }


class AgentKnowledgeBase(Base):
    """M2M: CustomAgent ↔ KnowledgeBase."""

    __tablename__ = "agent_knowledge_bases"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id   = Column(UUID(as_uuid=True), ForeignKey("custom_agents.id", ondelete="CASCADE"),
                        nullable=False)
    kb_id      = Column(UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
                        nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    agent = relationship("CustomAgent", back_populates="knowledge_bases")
    kb    = relationship("KnowledgeBase", back_populates="agent_links")

    __table_args__ = (
        Index("uq_agent_kb", "agent_id", "kb_id", unique=True),
    )

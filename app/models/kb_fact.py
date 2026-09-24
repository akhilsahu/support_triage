"""
KBFact — an authoritative attribute of something the knowledge base covers.

Retrieval finds the passage most similar to a question; it does not guarantee a
specific number reaches the answer. "What is the annual fee for SBI Card PRIME?"
is a lookup, and the value lives in a shared MITC document listing ~20 cards.
Facts are the deterministic layer over that: a small set of confirmed
label/value pairs injected into the prompt on every turn, so the figure is
present whether or not similarity cooperated.

Two properties are load-bearing:

  verified — extraction proposes, a human confirms. Nothing unverified is ever
    shown to an agent. The source table has both "SBI Card MILES PRIME" and
    "SBI Card PRIME" one row apart, so an auto-accepted match is a confidently
    wrong fee rather than a missing one.

  subject vs topic — `subject` is the name exactly as written in the source, kept
    so a reviewer can see what was matched; `topic` is the slug that routes the
    fact to an agent. They are separate because the mapping between them is a
    human judgement, not a string comparison.
"""

from __future__ import annotations
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, ForeignKey, Index, JSON, CheckConstraint, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class KBFact(Base):
    __tablename__ = "kb_facts"

    id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kb_id    = Column(UUID(as_uuid=True), nullable=False)
    space_id = Column(UUID(as_uuid=True), nullable=False)

    topic    = Column(String(120), nullable=True)    # routes to agents; NULL = unassigned
    subject  = Column(String(200), nullable=False)   # verbatim from the source
    label    = Column(String(200), nullable=False)   # "Annual Fee"
    value    = Column(Text, nullable=False)          # "₹2,999 + applicable taxes"
    value_json = Column(JSONB, nullable=True)        # Typed value for deterministic lookup
    note     = Column(Text, nullable=True)           # "Waived on annual spends of ₹3 Lakh"

    # Provenance
    source_doc_id   = Column(String(500), nullable=True)
    source_filename = Column(String(500), nullable=True)
    source_page     = Column(Integer, nullable=True)

    # Hardening & Lifecycle
    review_status    = Column(String(30), default="extracted", nullable=False)
    source_item_id   = Column(UUID(as_uuid=True), nullable=True)
    source_version   = Column(Integer, nullable=True)
    valid_from       = Column(DateTime(timezone=True), nullable=True)
    valid_until      = Column(DateTime(timezone=True), nullable=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    superseded_by_id = Column(UUID(as_uuid=True), nullable=True)

    verified   = Column(Boolean, default=False, nullable=False) # Retained for compat
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    kb = relationship("KnowledgeBase", back_populates="facts")

    __table_args__ = (
        Index("ix_kb_fact_kb_verified", "kb_id", "verified"),
        Index("ix_kb_fact_topic", "topic"),
        UniqueConstraint('id', 'space_id', 'kb_id', name='uq_kb_facts_id_space_id_kb_id'),
        ForeignKeyConstraint(
            ['kb_id', 'space_id'],
            ['knowledge_bases.id', 'knowledge_bases.space_id'],
            ondelete='CASCADE',
            name='fk_kb_facts_kb_id_space_id'
        ),
        ForeignKeyConstraint(
            ['source_item_id', 'space_id', 'kb_id'],
            ['knowledge_base_items.id', 'knowledge_base_items.space_id', 'knowledge_base_items.kb_id'],
            ondelete='SET NULL',
            name='fk_kb_facts_source_item_id'
        ),
        ForeignKeyConstraint(
            ['superseded_by_id', 'space_id', 'kb_id'],
            ['kb_facts.id', 'kb_facts.space_id', 'kb_facts.kb_id'],
            ondelete='SET NULL',
            name='fk_kb_facts_superseded_by_id'
        ),
        CheckConstraint(
            "review_status IN ('extracted', 'owner_confirmed', 'source_authoritative', 'rejected', 'superseded')",
            name='ck_kb_facts_review_status'
        ),
        CheckConstraint(
            "(review_status IN ('owner_confirmed', 'source_authoritative')) = verified",
            name='ck_kb_facts_verified_match'
        ),
        CheckConstraint("valid_until > valid_from", name='ck_kb_facts_valid_time'),
        CheckConstraint("source_version > 0", name='ck_kb_facts_source_version'),
        CheckConstraint("superseded_by_id != id", name='ck_kb_facts_no_self_supersede'),
        CheckConstraint("(review_status = 'superseded') = (superseded_by_id IS NOT NULL)", name='ck_kb_facts_superseded_consistent')
    )

    def render(self) -> str:
        """One prompt line, provenance inline: 'Annual Fee: ₹2,999 (mitc.pdf, p.3)'."""
        line = f"{self.label}: {self.value}"
        if self.note:
            line += f" — {self.note}"
        if self.source_filename:
            page = f", p.{self.source_page}" if self.source_page else ""
            line += f"  ({self.source_filename}{page})"
        return line

    def to_dict(self) -> dict:
        return {
            "id":              str(self.id),
            "kb_id":           str(self.kb_id),
            "topic":           self.topic,
            "subject":         self.subject,
            "label":           self.label,
            "value":           self.value,
            "value_json":      self.value_json,
            "note":            self.note,
            "source_doc_id":   self.source_doc_id,
            "source_filename": self.source_filename,
            "source_page":     self.source_page,
            "verified":        self.verified,
            "review_status":   self.review_status,
            "source_item_id":  str(self.source_item_id) if self.source_item_id else None,
            "source_version":  self.source_version,
            "superseded_by_id": str(self.superseded_by_id) if self.superseded_by_id else None,
            "valid_from":      self.valid_from.isoformat() if self.valid_from else None,
            "valid_until":     self.valid_until.isoformat() if self.valid_until else None,
            "last_verified_at": self.last_verified_at.isoformat() if self.last_verified_at else None,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
        }

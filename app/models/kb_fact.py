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

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class KBFact(Base):
    __tablename__ = "kb_facts"

    id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kb_id    = Column(UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
                      nullable=False)
    space_id = Column(UUID(as_uuid=True), nullable=False)

    topic    = Column(String(120), nullable=True)    # routes to agents; NULL = unassigned
    subject  = Column(String(200), nullable=False)   # verbatim from the source
    label    = Column(String(200), nullable=False)   # "Annual Fee"
    value    = Column(Text, nullable=False)          # "₹2,999 + applicable taxes"
    note     = Column(Text, nullable=True)           # "Waived on annual spends of ₹3 Lakh"

    # Provenance. Facts are injected into the system prompt rather than
    # retrieved, so they never pass through _citation_from_chunk and have to
    # carry their own citation inline.
    source_doc_id   = Column(String(500), nullable=True)
    source_filename = Column(String(500), nullable=True)
    source_page     = Column(Integer, nullable=True)

    verified   = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    kb = relationship("KnowledgeBase", back_populates="facts")

    __table_args__ = (
        Index("ix_kb_fact_kb_verified", "kb_id", "verified"),
        Index("ix_kb_fact_topic", "topic"),
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
            "note":            self.note,
            "source_doc_id":   self.source_doc_id,
            "source_filename": self.source_filename,
            "source_page":     self.source_page,
            "verified":        self.verified,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
        }

"""
IngestionJob — tracks one document upload through the ingestion pipeline.

Large documents take minutes to parse (vision over embedded images), far longer
than any sane HTTP timeout. Rather than hold the request open, uploads return
202 immediately with a job id and the work continues in the background; this
row is how the client follows along.

Status flow:
    queued -> parsing -> chunking -> indexing -> done
                      \\-> failed (error is set, surfaced to the user)

See app/orchestra/ai/ingestion/jobs/ for the runner that advances these rows.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base

# Terminal states — a job in one of these will never change again, so the
# frontend can stop polling once every job it cares about is here.
TERMINAL_STATUSES = ("done", "failed")


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id     = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    kb_id        = Column(UUID(as_uuid=True), nullable=True)   # KB the doc belongs to, when known

    filename     = Column(String(500), nullable=False)
    doc_type     = Column(String(50), nullable=True)
    kb_name      = Column(String(200), nullable=True)

    status       = Column(String(20), nullable=False, default="queued")
    progress     = Column(Integer, nullable=False, default=0)      # 0-100
    stage_detail = Column(String(200), nullable=True)              # e.g. "page 12 / 21"

    doc_id       = Column(String(64), nullable=True)               # ChromaDB doc id, set on success
    pages        = Column(Integer, nullable=True)
    chunks       = Column(Integer, nullable=True)
    error        = Column(Text, nullable=True)

    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_ingestion_jobs_space_created", "space_id", "created_at"),
    )

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    def to_dict(self) -> dict:
        return {
            "id":           str(self.id),
            "filename":     self.filename,
            "doc_type":     self.doc_type,
            "kb_name":      self.kb_name,
            "kb_id":        str(self.kb_id) if self.kb_id else None,
            "status":       self.status,
            "progress":     self.progress,
            "stage_detail": self.stage_detail,
            "doc_id":       self.doc_id,
            "pages":        self.pages,
            "chunks":       self.chunks,
            "error":        self.error,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
            "updated_at":   self.updated_at.isoformat() if self.updated_at else None,
        }

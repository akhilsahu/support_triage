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

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, ForeignKey, Index, JSON

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
    # Where the content came from: "file" (upload) | "url" (scrape). Drives
    # which KB tab shows this job's progress — without it a URL scrape reports
    # progress under "Documents", which is not where the user is looking.
    # Matches the KnowledgeBaseItem.item_type the job will create.
    source       = Column(String(20), nullable=False, default="file")

    status       = Column(String(20), nullable=False, default="queued")
    progress     = Column(Integer, nullable=False, default=0)      # 0-100
    stage_detail = Column(String(200), nullable=True)              # e.g. "page 12 / 21"

    doc_id           = Column(String(64), nullable=True)               # ChromaDB doc id, set on success
    pages            = Column(Integer, nullable=True)
    chunks           = Column(Integer, nullable=True)
    error            = Column(Text, nullable=True)

    # ETA (seconds) + Option 1 Enrichment & Cost Tracking
    eta_seconds      = Column(Integer, nullable=True)
    context_enriched = Column(Boolean, default=False, nullable=True)
    ai_cost_usd      = Column(Float, default=0.0, nullable=True)

    # JSON-safe args for the ingest_document task, captured at enqueue time so
    # a failed/interrupted job can be re-queued by the retry endpoint instead of
    # forcing the user to upload again. Nullable: old rows and jobs enqueued
    # before this column existed have no replayable payload.
    retry_payload = Column(JSON, nullable=True)

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
            "id":               str(self.id),
            "filename":         self.filename,
            "doc_type":         self.doc_type,
            "kb_name":          self.kb_name,
            "kb_id":            str(self.kb_id) if self.kb_id else None,
            "source":           self.source or "file",
            "status":           self.status,
            "progress":         self.progress,
            "stage_detail":     self.stage_detail,
            "eta_seconds":      self.eta_seconds,
            "context_enriched": self.context_enriched or False,
            "ai_cost_usd":      round(self.ai_cost_usd or 0.0, 6),
            "doc_id":           self.doc_id,
            "pages":            self.pages,
            "chunks":           self.chunks,
            "error":            self.error,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
            "updated_at":       self.updated_at.isoformat() if self.updated_at else None,
        }


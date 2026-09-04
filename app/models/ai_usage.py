"""AiUsageEvent — one row per AI provider call (chat, embedding, rerank, ...).

Fail-open telemetry: written by app/services/ai_usage.py in an independent
transaction; attribution columns are nullable because system-level calls
(no space context) still deserve a row.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base


class AiUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id     = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                          nullable=True, index=True)
    chatbot_id   = Column(UUID(as_uuid=True), nullable=True, index=True)
    kb_id        = Column(UUID(as_uuid=True), nullable=True, index=True)
    session_id   = Column(UUID(as_uuid=True), nullable=True, index=True)
    message_id   = Column(UUID(as_uuid=True), nullable=True)
    # chat | embedding | rerank | ingestion | evaluation | suggestion | assignment
    kind         = Column(String(30), nullable=False, index=True)
    provider     = Column(String(40), nullable=False)
    model        = Column(String(120), nullable=False)
    prompt_tokens     = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    total_tokens      = Column(Integer, nullable=True)
    estimated    = Column(Boolean, nullable=False, default=False)
    cost_usd     = Column(Numeric(12, 6), nullable=True)
    latency_ms   = Column(Integer, nullable=True)
    ok           = Column(Boolean, nullable=False, default=True)
    error_type   = Column(String(120), nullable=True)
    meta         = Column(JSONB, nullable=True)
    created_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

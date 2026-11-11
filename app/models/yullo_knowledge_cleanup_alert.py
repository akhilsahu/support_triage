import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class YulloKnowledgeCleanupAlert(Base):
    """Owner decision required after a source is removed but knowledge is retained."""

    __tablename__ = "yullo_knowledge_cleanup_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(
        UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    deleted_source_id = Column(UUID(as_uuid=True), nullable=False)
    source_title = Column(String(500), nullable=False)
    source_locator = Column(String(1000), nullable=True)
    fact_ids = Column(JSONB, nullable=False, default=list, server_default="[]")
    entity_ids = Column(JSONB, nullable=False, default=list, server_default="[]")
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_yullo_cleanup_alert_space_status", "space_id", "status"),
        CheckConstraint("status IN ('pending', 'resolved')", name="ck_yullo_cleanup_alert_status"),
        CheckConstraint("revision > 0", name="ck_yullo_cleanup_alert_revision"),
    )


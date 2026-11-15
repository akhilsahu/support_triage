"""Explicit public access settings; originals remain in KnowledgeBaseItem/blob storage."""
from sqlalchemy import CheckConstraint, Column, ForeignKeyConstraint, Integer
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class YulloSourceResource(Base):
    __tablename__ = "yullo_source_resources"
    source_id = Column(UUID(as_uuid=True), primary_key=True)
    space_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    source_kb_id = Column(UUID(as_uuid=True), nullable=False)
    shared_source_version = Column(Integer, nullable=True)
    revision = Column(Integer, nullable=False, default=1)
    __table_args__ = (
        ForeignKeyConstraint(["source_id", "space_id", "source_kb_id"],
            ["knowledge_base_items.id", "knowledge_base_items.space_id", "knowledge_base_items.kb_id"], ondelete="CASCADE"),
        CheckConstraint("shared_source_version IS NULL OR shared_source_version >= 1", name="ck_yullo_resource_version"),
        CheckConstraint("revision >= 1", name="ck_yullo_resource_revision"),
    )

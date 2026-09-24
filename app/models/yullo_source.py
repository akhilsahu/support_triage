import uuid
from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, DateTime, Index, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base

class YulloSource(Base):
    """
    A source document ingested for a Yullo Space.
    
    Yullo uses KnowledgeBaseItem to store text chunks in Vector DB, so we 
    link directly to it rather than the legacy Support247 Document table.
    """
    __tablename__ = "yullo_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    
    # The Knowledge Base it belongs to
    kb_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=True)

    # The actual chunked knowledge item
    kb_item_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_base_items.id", ondelete="SET NULL"), nullable=True)
    
    # The ingestion job tracking progress
    ingestion_job_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_jobs.id", ondelete="SET NULL"), nullable=True)
    
    # E.g. 'PDF', 'URL', 'API'
    type = Column(String, nullable=False)
    
    content_hash = Column(String, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    
    # Any additional metadata like filename, status, error_msg etc
    metadata_json = Column("metadata", JSONB, default={}, nullable=False, server_default="{}")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    space = relationship("Space")
    # Using string reference for knowledge_base_items since we don't strictly need bidirectional relationship right now
    kb_item = relationship("KnowledgeBaseItem")

    __table_args__ = (
        Index("ix_yullo_sources_space_id", space_id),
    )

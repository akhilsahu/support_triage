"""
YulloSpace — 1:1 extension of Space for Yullo-specific product boundary.
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from sqlalchemy.orm import relationship


class YulloSpace(Base):
    __tablename__ = "yullo_spaces"

    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True)
    parent_space_id = Column(UUID(as_uuid=True), ForeignKey("yullo_spaces.space_id", name="fk_yullo_space_parent", ondelete="RESTRICT"), nullable=True, index=True)
    space_type = Column(String(30), nullable=False, default="space", server_default="space")
    hierarchy_revision = Column(Integer, nullable=False, default=1, server_default="1")
    purpose = Column(String(50), nullable=True)
    onboarding_step = Column(String(50), nullable=True)
    lifecycle_status = Column(String(50), nullable=True)
    handle_reserved_until = Column(DateTime(timezone=True), nullable=True)
    
    context_version = Column(Integer, nullable=False, default=1)
    preview_version = Column(Integer, nullable=True)
    published_version = Column(Integer, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    
    appearance_config = Column(JSON, nullable=True)
    
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", foreign_keys=[space_id])

    __table_args__ = (
        CheckConstraint("parent_space_id IS NULL OR parent_space_id <> space_id", name="ck_yullo_space_not_own_parent"),
        CheckConstraint("space_type IN ('space', 'event', 'project', 'location', 'community', 'service', 'job', 'other', 'posting')", name="ck_yullo_space_type"),
        CheckConstraint("hierarchy_revision >= 1", name="ck_yullo_hierarchy_revision"),
    )

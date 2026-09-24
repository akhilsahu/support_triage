"""
YulloSpace — 1:1 extension of Space for Yullo-specific product boundary.
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from sqlalchemy.orm import relationship


class YulloSpace(Base):
    __tablename__ = "yullo_spaces"

    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True)
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

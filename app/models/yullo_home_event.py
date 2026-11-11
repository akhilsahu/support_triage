"""
YulloHomeEvent — Non-conversation product events for Yullo.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from sqlalchemy.orm import relationship


class YulloHomeEvent(Base):
    __tablename__ = "yullo_home_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False, index=True)
    
    event_type = Column(String(50), nullable=False)
    subject_type = Column(String(50), nullable=False)
    subject_id = Column(String(100), nullable=False)
    
    dedupe_key = Column(String(180), nullable=False)
    event_metadata = Column(JSON, nullable=True)
    
    occurred_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        # Partial unique index for dedupe_key per space
        Index('uix_yullo_home_events_space_dedupe', 'space_id', 'dedupe_key', unique=True),
    )
    
    # Relationships
    space = relationship("Space", foreign_keys=[space_id])

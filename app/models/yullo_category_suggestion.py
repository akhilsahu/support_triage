"""
Database model for Yullo category suggestions.
Stores standard and trending categories seeded or collected over time.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class YulloCategorySuggestion(Base):
    __tablename__ = "yullo_category_suggestions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False, index=True)
    purpose = Column(String(50), nullable=True, index=True)
    is_popular = Column(Boolean, default=False, nullable=False)
    usage_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

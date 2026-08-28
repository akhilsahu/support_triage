from __future__ import annotations
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, JSON
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class TrainingFeedback(Base):
    __tablename__ = "training_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_subjects = Column(JSON, nullable=False)   # List of subjects fed to the model
    corrected_hierarchy = Column(JSON, nullable=False) # The human-verified JSON output
    status = Column(String, default="pending", nullable=False) # "pending" or "processed"
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "original_subjects": self.original_subjects,
            "corrected_hierarchy": self.corrected_hierarchy,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

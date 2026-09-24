"""
User Model — Primary account identity for Yullo platform users.
A User owns or manages zero, one, or multiple public Spaces/Auras.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class User(Base):
    """
    User Account model.
    Represents the individual human/organization account that authenticates via AuthIdentity
    (Google, Phone OTP, Email OTP).
    """

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=True, unique=True, index=True)
    phone = Column(String(50), nullable=True, unique=True, index=True)
    full_name = Column(String(200), nullable=True)

    onboarding_completed = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    identities = relationship("AuthIdentity", back_populates="user", cascade="all, delete-orphan")
    spaces = relationship("Space", back_populates="owner_user")
    yullo_sessions = relationship("YulloUserSession", back_populates="user", cascade="all, delete-orphan")
    yullo_preference = relationship("YulloUserPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "email": self.email,
            "phone": self.phone,
            "full_name": self.full_name,
            "onboarding_completed": self.onboarding_completed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

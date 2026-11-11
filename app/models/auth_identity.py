"""
AuthIdentity Model — Specific authentication method attached to a User account.
Supports Google OAuth (sub), Phone OTP (E.164), and Email OTP.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class AuthIdentity(Base):
    """
    Represents one login credential/provider link for a User account.
    Unique constraint on (provider, provider_subject) prevents duplicate credentials across different users.
    """

    __tablename__ = "auth_identities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    provider = Column(String(20), nullable=False)  # google | phone | email
    provider_subject = Column(String(255), nullable=False, index=True)  # google sub, E.164 phone, or email

    verified_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationship back to User
    user = relationship("User", back_populates="identities")

    __table_args__ = (
        Index("uix_provider_subject", "provider", "provider_subject", unique=True),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "provider": self.provider,
            "provider_subject": self.provider_subject,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

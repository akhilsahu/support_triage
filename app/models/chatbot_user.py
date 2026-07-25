"""
End-customer identity models (chatbot users).

Platform-wide (NOT space-scoped): one ChatbotUser per person, shared across
every space's chatbot, so a customer logs in once and their chat history
follows them anywhere on the platform. Entirely separate from space-owner
(dashboard) auth.

Two tables so future auth methods are additive rows, not schema changes:
  - ChatbotUser         — the person/profile (provider-agnostic).
  - ChatbotUserIdentity — one row per login method (google today; phone /
    email / facebook later), unique on (provider, provider_sub). Two methods
    can link to the same person (account linking by verified email).

Provider-specific secrets (password hashes, OTP state) deliberately do NOT
live here — they'd get a per-provider table when that provider lands.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class ChatbotUser(Base):
    """One end customer (platform-wide), whatever method they log in with."""

    __tablename__ = "chatbot_users"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email        = Column(String(320), nullable=True)   # phone-only users won't have one
    phone        = Column(String(20), nullable=True)    # reserved for future phone auth
    name         = Column(String(200), nullable=True)
    avatar_url   = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    identities = relationship("ChatbotUserIdentity", back_populates="user",
                              cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_chatbot_users_email", "email"),
    )

    def to_dict(self) -> dict:
        return {
            "id":         str(self.id),
            "email":      self.email,
            "name":       self.name,
            "avatar_url": self.avatar_url,
        }


class ChatbotUserIdentity(Base):
    """One login method for a ChatbotUser. (provider, provider_sub) is the
    identity key: google -> Google's stable `sub`; later phone -> E.164 number,
    email -> the email address."""

    __tablename__ = "chatbot_user_identities"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      = Column(UUID(as_uuid=True),
                          ForeignKey("chatbot_users.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    provider     = Column(String(20), nullable=False)    # 'google' | 'phone' | 'email' | ...
    provider_sub = Column(String(255), nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("ChatbotUser", back_populates="identities")

    __table_args__ = (
        Index("ix_chatbot_user_identity_key", "provider", "provider_sub", unique=True),
    )

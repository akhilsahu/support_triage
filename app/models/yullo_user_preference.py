from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class YulloUserPreference(Base):
    """
    User-level preferences for the Yullo management app (e.g. app_theme, timezone).
    """
    __tablename__ = "yullo_user_preferences"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True
    )
    app_theme = Column(String(20), default="system", nullable=False)
    timezone = Column(String(64), nullable=True)
    home_sections = Column(JSONB, nullable=False, server_default='[]')
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="yullo_preference")

    __table_args__ = (
        CheckConstraint(
            "app_theme IN ('system', 'light', 'warm', 'dark')",
            name="chk_yullo_user_preferences_app_theme"
        ),
    )

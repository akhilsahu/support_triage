from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class YulloAppearanceAsset(Base):
    """An image owned by one Yullo Space and stored outside the public tree."""

    __tablename__ = "yullo_appearance_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(
        UUID(as_uuid=True),
        ForeignKey("yullo_spaces.space_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    storage_key = Column(Text, nullable=False)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(80), nullable=False)
    byte_size = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    alt_text = Column(String(300), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint("space_id", "storage_key", name="uq_yullo_appearance_asset_storage"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_yullo_appearance_asset_status"),
        CheckConstraint("byte_size > 0", name="ck_yullo_appearance_asset_size"),
        CheckConstraint("width > 0 AND height > 0", name="ck_yullo_appearance_asset_dimensions"),
    )

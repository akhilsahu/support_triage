"""Yullo-only discoverability settings; content remains in canonical Space records."""
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class YulloSpaceBeacon(Base):
    __tablename__ = "yullo_space_beacons"

    space_id = Column(UUID(as_uuid=True), ForeignKey("yullo_spaces.space_id", ondelete="CASCADE"), primary_key=True)
    state = Column(String(12), nullable=False, default="paused")
    reach = Column(String(16), nullable=False)
    target_area = Column(JSONB, nullable=False, default=dict)
    origin_location_entity_id = Column(UUID(as_uuid=True), ForeignKey("yullo_space_entities.id", ondelete="SET NULL"), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revision = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("state IN ('active', 'paused')", name="ck_yullo_beacon_state"),
        CheckConstraint("reach IN ('nearby_5', 'nearby_10', 'city', 'country', 'worldwide')", name="ck_yullo_beacon_reach"),
        CheckConstraint("revision >= 1", name="ck_yullo_beacon_revision"),
    )

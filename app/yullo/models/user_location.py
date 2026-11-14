"""Latest private location observation for one Yullo account; no location history."""
from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID

from app.core.database import Base


class YulloUserLocation(Base):
    __tablename__ = "yullo_user_locations"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    area = Column(JSONB, nullable=True)
    accuracy_m = Column(Float, nullable=True)
    source = Column(String(20), nullable=True)
    captured_at = Column(DateTime(timezone=True), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    ip_address = Column(INET, nullable=True)
    ip_observed_at = Column(DateTime(timezone=True), nullable=False)

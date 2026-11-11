from datetime import datetime
import uuid
from sqlalchemy import Column, DateTime, String, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base

class YulloConfig(Base):
    """
    Yullo product-specific configuration. 
    Maintains a strict 1:1 relationship with the Space root identity.
    All Yullo features and configuration logic should be stored here, 
    isolating them from the legacy support247 fields on Space.
    """
    __tablename__ = "yullo_configs"

    # Space ID serves as the primary key to guarantee a true 1:1 relationship
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True)
    
    # Store schema-validated Yullo settings as JSONB
    settings = Column(JSONB, nullable=False, server_default='{}')
    
    # Audit timestamps for creation and modification tracking
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship to the parent Space
    space = relationship("Space", back_populates="yullo_config")

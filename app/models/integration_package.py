import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class IntegrationPackage(Base):
    """
    A global template for an integration (e.g. Shopify, Zendesk).
    Managed by Super Admins.
    """
    __tablename__ = "integration_packages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(50), nullable=False, unique=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False, default="")
    icon_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=False, index=True)
    
    # Template for creating the DataSourceConnection
    connection_template = Column(JSONB, nullable=False, default=dict)
    
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    tools = relationship("IntegrationPackageTool", back_populates="package", cascade="all, delete-orphan")


class IntegrationPackageTool(Base):
    """
    A specific tool (e.g. 'Get Order') belonging to an integration package.
    """
    __tablename__ = "integration_package_tools"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    package_id = Column(
        UUID(as_uuid=True), ForeignKey("integration_packages.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name = Column(String(64), nullable=False)
    display_name = Column(String(200), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    method = Column(String(10), nullable=False, default="GET")
    path = Column(String(1000), nullable=False, default="")
    risk_classification = Column(String(20), nullable=False, default="read")
    
    input_schema = Column(JSONB, nullable=False, default=dict)
    request_template = Column(JSONB, nullable=False, default=dict)
    output_mapping = Column(JSONB, nullable=False, default=dict)
    
    record_path = Column(String(500), nullable=False, default="")
    max_records = Column(Integer, nullable=False, default=25)
    
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    package = relationship("IntegrationPackage", back_populates="tools")

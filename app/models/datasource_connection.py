"""Reusable, tenant-scoped connection details for external data-source tools."""

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.services.datasource.sanitizer import sanitize_mapping


class DataSourceConnection(Base):
    """Transport configuration shared by one or more callable tools."""

    __tablename__ = "data_source_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(
        UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default="draft", index=True)
    base_url = Column(String(1000), nullable=False, default="")
    auth_type = Column(String(30), nullable=False, default="none")
    auth_header = Column(String(100), nullable=False, default="Authorization")
    encrypted_secret = Column(Text, nullable=True)
    auth_metadata_json = Column(Text, nullable=False, default="{}")
    default_headers_json = Column(Text, nullable=False, default="{}")
    last_health_status = Column(String(30), nullable=True)
    last_health_message = Column(Text, nullable=True)
    last_health_checked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", back_populates="datasource_connections")
    tools = relationship(
        "DataSourceTool", back_populates="connection", cascade="all, delete-orphan",
    )
    test_runs = relationship(
        "DataSourceTestRun", back_populates="connection", cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("space_id", "name", name="uq_datasource_connection_space_name"),
    )

    @staticmethod
    def _load_json(raw: str | None) -> dict:
        try:
            value = json.loads(raw or "{}")
            return value if isinstance(value, dict) else {}
        except (TypeError, ValueError):
            return {}

    @property
    def default_headers(self) -> dict:
        return self._load_json(self.default_headers_json)

    @default_headers.setter
    def default_headers(self, value: dict) -> None:
        self.default_headers_json = json.dumps(value or {})

    @property
    def auth_metadata(self) -> dict:
        return self._load_json(self.auth_metadata_json)

    @auth_metadata.setter
    def auth_metadata(self, value: dict) -> None:
        self.auth_metadata_json = json.dumps(value or {})

    def to_dict(self) -> dict:
        """Return the public representation; encrypted material is never exposed."""
        return {
            "id": str(self.id) if self.id else None,
            "space_id": str(self.space_id) if self.space_id else None,
            "name": self.name,
            "status": self.status,
            "base_url": self.base_url,
            "auth_type": self.auth_type,
            "auth_header": self.auth_header,
            "auth_metadata": sanitize_mapping(self.auth_metadata),
            # Preserve configured names for the editor without ever returning
            # header values; arbitrary provider headers can contain secrets.
            "default_headers": {
                key: "[REDACTED]" for key in self.default_headers
            },
            "credential_configured": bool(self.encrypted_secret),
            "last_health_status": self.last_health_status,
            "last_health_message": self.last_health_message,
            "last_health_checked_at": (
                self.last_health_checked_at.isoformat() if self.last_health_checked_at else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

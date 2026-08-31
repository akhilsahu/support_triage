"""One model-callable REST operation backed by a data-source connection."""

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class DataSourceTool(Base):
    __tablename__ = "data_source_tools"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(
        UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("data_source_connections.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name = Column(String(64), nullable=False)
    display_name = Column(String(200), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    method = Column(String(10), nullable=False, default="GET")
    path = Column(String(1000), nullable=False, default="")
    status = Column(String(20), nullable=False, default="draft", index=True)
    risk_classification = Column(String(20), nullable=False, default="read")
    input_schema_json = Column(Text, nullable=False, default="{}")
    request_template_json = Column(Text, nullable=False, default="{}")
    output_mapping_json = Column(Text, nullable=False, default="{}")
    record_path = Column(String(500), nullable=False, default="")
    max_records = Column(Integer, nullable=False, default=25)
    max_response_bytes = Column(Integer, nullable=False, default=1_000_000)
    revision = Column(Integer, nullable=False, default=1)
    migration_warning = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", back_populates="datasource_tools")
    connection = relationship("DataSourceConnection", back_populates="tools")
    assignments = relationship(
        "AgentToolAssignment", back_populates="tool", cascade="all, delete-orphan",
    )
    test_runs = relationship(
        "DataSourceTestRun", back_populates="tool", cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("space_id", "name", name="uq_datasource_tool_space_name"),
    )

    @staticmethod
    def _load_json(raw: str | None) -> dict:
        try:
            value = json.loads(raw or "{}")
            return value if isinstance(value, dict) else {}
        except (TypeError, ValueError):
            return {}

    @property
    def input_schema(self) -> dict:
        return self._load_json(self.input_schema_json)

    @input_schema.setter
    def input_schema(self, value: dict) -> None:
        self.input_schema_json = json.dumps(value or {})

    @property
    def request_template(self) -> dict:
        return self._load_json(self.request_template_json)

    @request_template.setter
    def request_template(self, value: dict) -> None:
        self.request_template_json = json.dumps(value or {})

    @property
    def output_mapping(self) -> dict:
        return self._load_json(self.output_mapping_json)

    @output_mapping.setter
    def output_mapping(self, value: dict) -> None:
        self.output_mapping_json = json.dumps(value or {})

    def to_dict(self) -> dict:
        return {
            "id": str(self.id) if self.id else None,
            "space_id": str(self.space_id) if self.space_id else None,
            "connection_id": str(self.connection_id) if self.connection_id else None,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "method": self.method,
            "path": self.path,
            "status": self.status,
            "risk_classification": self.risk_classification,
            "input_schema": self.input_schema,
            "request_template": self.request_template,
            "output_mapping": self.output_mapping,
            "record_path": self.record_path,
            "max_records": self.max_records,
            "max_response_bytes": self.max_response_bytes,
            "revision": self.revision,
            "migration_warning": self.migration_warning,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

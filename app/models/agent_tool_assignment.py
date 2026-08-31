"""Agent authorization and sanitized test history for data-source tools."""

import json
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class AgentToolAssignment(Base):
    __tablename__ = "agent_tool_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(
        UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    chatbot_id = Column(
        UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    tool_id = Column(
        UUID(as_uuid=True), ForeignKey("data_source_tools.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    agent_kind = Column(String(20), nullable=False)
    agent_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", back_populates="agent_tool_assignments")
    chatbot = relationship("Chatbot")
    tool = relationship("DataSourceTool", back_populates="assignments")

    __table_args__ = (
        UniqueConstraint(
            "chatbot_id", "tool_id", "agent_kind", "agent_id",
            name="uq_agent_tool_assignment_target",
        ),
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id) if self.id else None,
            "space_id": str(self.space_id) if self.space_id else None,
            "chatbot_id": str(self.chatbot_id) if self.chatbot_id else None,
            "tool_id": str(self.tool_id) if self.tool_id else None,
            "agent_kind": self.agent_kind,
            "agent_id": str(self.agent_id) if self.agent_id else None,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class DataSourceTestRun(Base):
    """A bounded, sanitized diagnostic record for a connection/tool test."""

    __tablename__ = "data_source_test_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(
        UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("data_source_connections.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    tool_id = Column(
        UUID(as_uuid=True), ForeignKey("data_source_tools.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    outcome = Column(String(20), nullable=False)
    failure_category = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    status_code = Column(Integer, nullable=True)
    diagnostics_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    space = relationship("Space", back_populates="datasource_test_runs")
    connection = relationship("DataSourceConnection", back_populates="test_runs")
    tool = relationship("DataSourceTool", back_populates="test_runs")

    @property
    def diagnostics(self) -> dict:
        try:
            value = json.loads(self.diagnostics_json or "{}")
            return value if isinstance(value, dict) else {}
        except (TypeError, ValueError):
            return {}

    @diagnostics.setter
    def diagnostics(self, value: dict) -> None:
        self.diagnostics_json = json.dumps(value or {})

    def to_dict(self) -> dict:
        return {
            "id": str(self.id) if self.id else None,
            "space_id": str(self.space_id) if self.space_id else None,
            "connection_id": str(self.connection_id) if self.connection_id else None,
            "tool_id": str(self.tool_id) if self.tool_id else None,
            "outcome": self.outcome,
            "failure_category": self.failure_category,
            "message": self.message,
            "latency_ms": self.latency_ms,
            "status_code": self.status_code,
            "diagnostics": self.diagnostics,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

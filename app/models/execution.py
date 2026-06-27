"""Execution model for tracking workflow and task execution history"""

from sqlalchemy import Column, String, Float, DateTime, JSON, ForeignKey, Enum, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.core.database import Base


class ExecutionStatus(str, enum.Enum):
    """Execution status"""
    STARTED = "started"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Execution(Base):
    """
    Execution model for tracking detailed execution history.
    
    Stores comprehensive information about workflow and task executions,
    including timing, resource usage, and detailed logs.
    """
    
    __tablename__ = "executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True, index=True)
    execution_type = Column(String(50), nullable=False)  # workflow, task, agent
    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    error_traceback = Column(Text, nullable=True)
    duration = Column(Float, nullable=True)  # Duration in seconds
    status = Column(Enum(ExecutionStatus), nullable=False, index=True)
    exec_metadata = Column(JSON, default={}, nullable=False)
    logs = Column(JSON, default=[], nullable=False)  # Execution logs
    metrics = Column(JSON, default={}, nullable=False)  # Performance metrics
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    workflow = relationship("Workflow", backref="executions", foreign_keys=[workflow_id])
    task = relationship("Task", backref="executions", foreign_keys=[task_id])
    agent = relationship("Agent", backref="executions", foreign_keys=[agent_id])

    # Indexes for common queries
    __table_args__ = (
        Index('ix_executions_workflow_status', 'workflow_id', 'status'),
        Index('ix_executions_task_status', 'task_id', 'status'),
        Index('ix_executions_agent_status', 'agent_id', 'status'),
        Index('ix_executions_type_status', 'execution_type', 'status'),
        Index('ix_executions_created_at', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Execution(id={self.id}, type={self.execution_type}, status={self.status})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": str(self.id),
            "workflow_id": str(self.workflow_id) if self.workflow_id else None,
            "task_id": str(self.task_id) if self.task_id else None,
            "agent_id": str(self.agent_id) if self.agent_id else None,
            "execution_type": self.execution_type,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "error": self.error,
            "duration": self.duration,
            "status": self.status.value,
            "metadata": self.exec_metadata,
            "logs": self.logs,
            "metrics": self.metrics,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    def is_completed(self) -> bool:
        """Check if execution is completed"""
        return self.status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED]

    def add_log(self, level: str, message: str) -> None:
        """Add a log entry"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message
        }
        if not isinstance(self.logs, list):
            self.logs = []
        self.logs.append(log_entry)

# Made with Bob

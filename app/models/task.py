"""Task model for agent execution tracking"""

from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Enum, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.core.database import Base


class TaskStatus(str, enum.Enum):
    """Task execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class Task(Base):
    """
    Task model for tracking individual agent executions.
    
    Tasks can be standalone or part of a workflow. They track the execution
    state, input/output data, and any errors that occur.
    """
    
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    input_data = Column(JSON, nullable=False)
    output_data = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    error_traceback = Column(Text, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING, nullable=False, index=True)
    priority = Column(Integer, default=0, nullable=False, index=True)
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    timeout = Column(Integer, default=300, nullable=False)  # Timeout in seconds
    task_metadata = Column("metadata", JSON, default={}, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    workflow = relationship("Workflow", backref="tasks", foreign_keys=[workflow_id])
    agent = relationship("Agent", backref="tasks", foreign_keys=[agent_id])

    # Indexes for common queries
    __table_args__ = (
        Index('ix_tasks_status_priority', 'status', 'priority'),
        Index('ix_tasks_workflow_status', 'workflow_id', 'status'),
        Index('ix_tasks_agent_status', 'agent_id', 'status'),
        Index('ix_tasks_created_at', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Task(id={self.id}, name={self.name}, status={self.status})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": str(self.id),
            "workflow_id": str(self.workflow_id) if self.workflow_id else None,
            "agent_id": str(self.agent_id),
            "name": self.name,
            "description": self.description,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "error_message": self.error_message,
            "status": self.status.value,
            "priority": self.priority,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "timeout": self.timeout,
            "metadata": self.task_metadata,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def is_completed(self) -> bool:
        """Check if task is completed"""
        return self.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]

    def can_retry(self) -> bool:
        """Check if task can be retried"""
        return self.retry_count < self.max_retries and self.status == TaskStatus.FAILED

    def get_duration(self) -> float:
        """Get task execution duration in seconds"""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return 0.0

# Made with Bob

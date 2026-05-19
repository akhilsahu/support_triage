"""Workflow model for agent orchestration"""

from sqlalchemy import Column, String, Text, Enum, DateTime, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum
from app.core.database import Base


class ExecutionType(str, enum.Enum):
    """Workflow execution strategies"""
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    CONDITIONAL = "conditional"
    GRAPH = "graph"


class WorkflowStatus(str, enum.Enum):
    """Workflow lifecycle status"""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class Workflow(Base):
    """
    Workflow model for orchestrating multiple agents.
    
    Defines how agents should be executed (sequentially, in parallel, or conditionally)
    and manages the flow of data between agents.
    """
    
    __tablename__ = "workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    execution_type = Column(Enum(ExecutionType), nullable=False, index=True)
    steps = Column(JSON, nullable=False)  # Workflow definition with agent IDs and connections
    configuration = Column(JSON, default={}, nullable=False)
    status = Column(Enum(WorkflowStatus), default=WorkflowStatus.DRAFT, nullable=False, index=True)
    version = Column(String(50), default="1.0.0")
    tags = Column(JSON, default=[], nullable=False)
    timeout = Column(String(10), default="600")  # Timeout in seconds
    retry_policy = Column(JSON, default={"max_retries": 3, "retry_delay": 5})
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Indexes for common queries
    __table_args__ = (
        Index('ix_workflows_status_type', 'status', 'execution_type'),
        Index('ix_workflows_created_at', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Workflow(id={self.id}, name={self.name}, type={self.execution_type})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "execution_type": self.execution_type.value,
            "steps": self.steps,
            "configuration": self.configuration,
            "status": self.status.value,
            "version": self.version,
            "tags": self.tags,
            "timeout": self.timeout,
            "retry_policy": self.retry_policy,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def is_active(self) -> bool:
        """Check if workflow is active"""
        return self.status == WorkflowStatus.ACTIVE

    def get_step_count(self) -> int:
        """Get number of steps in workflow"""
        return len(self.steps) if isinstance(self.steps, list) else 0

# Made with Bob

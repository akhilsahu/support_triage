"""Agent model for multi-agent system"""

from sqlalchemy import Column, String, Text, Enum, DateTime, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.core.database import Base


class AgentType(str, enum.Enum):
    """Types of agents in the system"""
    CHAT = "chat"
    TASK = "task"
    ANALYSIS = "analysis"
    ORCHESTRATOR = "orchestrator"
    CUSTOM = "custom"


class AgentStatus(str, enum.Enum):
    """Agent operational status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"
    ERROR = "error"


class Agent(Base):
    """
    Agent model representing an AI agent in the multi-agent system.
    
    Each agent has specific capabilities and can be orchestrated to perform
    various tasks either independently or as part of a workflow.
    """
    
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    type = Column(Enum(AgentType), nullable=False, index=True)
    description = Column(Text)
    capabilities = Column(JSON, default=[], nullable=False)
    configuration = Column(JSON, default={}, nullable=False)
    status = Column(Enum(AgentStatus), default=AgentStatus.ACTIVE, nullable=False, index=True)
    version = Column(String(50), default="1.0.0")
    llm_model = Column(String(100), nullable=True)  # LLM model used (renamed from model_name to avoid Pydantic conflict)
    temperature = Column(String(10), default="0.7")
    max_tokens = Column(String(10), default="2000")
    system_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Indexes for common queries
    __table_args__ = (
        Index('ix_agents_type_status', 'type', 'status'),
        Index('ix_agents_created_at', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Agent(id={self.id}, name={self.name}, type={self.type})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": str(self.id),
            "name": self.name,
            "type": self.type.value,
            "description": self.description,
            "capabilities": self.capabilities,
            "configuration": self.configuration,
            "status": self.status.value,
            "version": self.version,
            "model_name": self.llm_model,  # Keep API field name for backward compatibility
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "system_prompt": self.system_prompt,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def is_active(self) -> bool:
        """Check if agent is active"""
        return self.status == AgentStatus.ACTIVE

    def has_capability(self, capability: str) -> bool:
        """Check if agent has a specific capability"""
        return capability in self.capabilities

# Made with Bob

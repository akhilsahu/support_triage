"""Pydantic schemas for Agent model"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from uuid import UUID

from app.models.agent import AgentType, AgentStatus


class AgentBase(BaseModel):
    """Base schema for Agent"""
    name: str = Field(..., min_length=1, max_length=255, description="Agent name")
    type: AgentType = Field(..., description="Agent type")
    description: Optional[str] = Field(None, description="Agent description")
    capabilities: List[str] = Field(default_factory=list, description="Agent capabilities")
    configuration: Dict[str, Any] = Field(default_factory=dict, description="Agent configuration")
    model_name: Optional[str] = Field(None, description="LLM model name (e.g., gpt-4, claude-3-opus)")
    temperature: Optional[str] = Field("0.7", description="Temperature for LLM")
    max_tokens: Optional[str] = Field("2000", description="Max tokens for LLM")
    system_prompt: Optional[str] = Field(None, description="System prompt for agent")


class AgentCreate(AgentBase):
    """Schema for creating an agent"""
    status: Optional[AgentStatus] = Field(AgentStatus.ACTIVE, description="Initial agent status")
    version: Optional[str] = Field("1.0.0", description="Agent version")


class AgentUpdate(BaseModel):
    """Schema for updating an agent"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[AgentType] = None
    description: Optional[str] = None
    capabilities: Optional[List[str]] = None
    configuration: Optional[Dict[str, Any]] = None
    status: Optional[AgentStatus] = None
    model_name: Optional[str] = None
    temperature: Optional[str] = None
    max_tokens: Optional[str] = None
    system_prompt: Optional[str] = None


class AgentResponse(AgentBase):
    """Schema for agent response"""
    id: UUID
    status: AgentStatus
    version: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentExecuteRequest(BaseModel):
    """Schema for executing an agent"""
    input_data: Dict[str, Any] = Field(..., description="Input data for agent")
    model: Optional[str] = Field(None, description="Override LLM model")
    temperature: Optional[float] = Field(None, ge=0, le=2, description="Override temperature")
    max_tokens: Optional[int] = Field(None, gt=0, description="Override max tokens")


class AgentExecuteResponse(BaseModel):
    """Schema for agent execution response"""
    agent_id: UUID
    output_data: Dict[str, Any]
    model: str
    provider: str
    usage: Optional[Dict[str, Any]] = None
    execution_time: float

# Made with Bob

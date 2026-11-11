from typing import List, Optional, Literal, Any
from pydantic import BaseModel, Field
from uuid import UUID

class SpaceChatProfile(BaseModel):
    name: str = Field(default='This Space', max_length=200)
    purpose: str = Field(default='', max_length=50)
    category: str = Field(default='', max_length=100)
    description: str = Field(default='', max_length=280)
    tone: str = 'clear_and_helpful'

class AuraInferenceRequest(BaseModel):
    space_id: UUID
    session_id: str
    runtime_id: str = "default_aura"
    message: str
    kb_ids: List[UUID] = Field(default_factory=list)
    published_version: Optional[int] = None
    model: Optional[str] = None # e.g. "gpt-4o-mini"
    
class AuraStreamEvent(BaseModel):
    event_type: Literal["status", "delta", "citations", "blocks", "done", "error"]
    data: Any

class AuraInferenceResponse(BaseModel):
    session_id: str
    message: str
    citations: List[dict] = Field(default_factory=list)
    blocks: List[dict] = Field(default_factory=list)
    sufficiency: str

from typing import List, Optional, Literal, Any, Dict
from pydantic import BaseModel, Field
from uuid import UUID

class AuraInferenceRequest(BaseModel):
    space_id: UUID
    session_id: str
    runtime_id: str
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

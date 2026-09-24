from typing import List, Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field
from datetime import datetime

class YulloExecutionContext(BaseModel):
    space_id: UUID
    kb_ids: List[UUID]
    published_version: Optional[int] = None
    is_preview: bool = False

class EvidencePack(BaseModel):
    structured_facts: List[dict] = Field(default_factory=list)
    passages: List[dict] = Field(default_factory=list)
    sufficiency: Literal["supported", "missing", "conflicting"] = "missing"

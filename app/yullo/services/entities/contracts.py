from typing import Optional, Dict, Any, List
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class SpaceEntityDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    space_id: UUID
    identity_key: str
    entity_type: str
    schema_version: int
    payload_json: Dict[str, Any]
    origin_type: str
    review_status: str
    is_active: bool
    is_public: bool
    revision: int
    created_at: datetime
    updated_at: datetime


class EntityCommand(BaseModel):
    identity_key: Optional[str] = None
    entity_type: str
    schema_version: int = 1
    payload_json: Dict[str, Any]
    is_public: bool = False

class EntityPatch(BaseModel):
    payload_json: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None

class ValidatedEntityCandidate(BaseModel):
    entity_type: str
    schema_version: int = 1
    payload_json: Dict[str, Any]
    evidence_locators: List[Dict[str, Any]]

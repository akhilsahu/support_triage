import uuid
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class VisitorProof(BaseModel):
    # Depending on your implementation, this might contain tokens or signatures
    # For now, it could be a simple struct with an auth token
    auth_token: str

class SessionCreated(BaseModel):
    session_id: uuid.UUID
    capability_token: str # Signed expiring capability bound to space and session

class AcceptedTurn(BaseModel):
    turn_id: uuid.UUID
    status: str
    message_id: uuid.UUID

class ValidatedAuraResult(BaseModel):
    # This comes from the streaming inference output
    text: str
    citations: List[Dict[str, Any]]
    ui_entity_ids: List[uuid.UUID]

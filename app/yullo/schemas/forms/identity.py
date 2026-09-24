import uuid
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from enum import Enum

class SpacePurpose(str, Enum):
    person = "person"
    creator = "creator"
    business = "business"
    organization = "organization"

class PresenceType(str, Enum):
    online = "online"
    physical = "physical"
    both = "both"
    mobile = "mobile"

class SpaceCreateRequest(BaseModel):
    display_name: Optional[str] = Field("Unnamed Space", max_length=200)
    slug: Optional[str] = Field(None, max_length=50)
    purpose: Optional[SpacePurpose] = Field(SpacePurpose.business)
    description: Optional[str] = Field(None, max_length=280)
    description_source: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=100)
    presence: Optional[PresenceType] = None
    website: Optional[str] = Field(None, max_length=500)
    
    model_config = ConfigDict(extra="forbid")


class IdentityForm(BaseModel):
    purpose: SpacePurpose = Field(..., description="Canonical space purpose")
    display_name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=3, max_length=50)
    logo_url: Optional[str] = Field(None, max_length=500)
    
    description: Optional[str] = Field(None, max_length=280)
    description_source: Optional[str] = Field(None, max_length=50)
    description_prompt_version: Optional[str] = Field(None, max_length=50)
    description_input_fingerprint: Optional[str] = Field(None, max_length=100)
    
    category: Optional[str] = Field(None, max_length=100)
    presence: Optional[PresenceType] = None
    
    website: Optional[str] = Field(None, max_length=500, description="HTTPS website URL")
    
    model_config = ConfigDict(extra="forbid")

class IdentityFormUpdate(BaseModel):
    purpose: Optional[SpacePurpose] = None
    display_name: Optional[str] = Field(None, min_length=1, max_length=200)
    logo_url: Optional[str] = Field(None, max_length=500)
    
    description: Optional[str] = Field(None, max_length=280)
    description_source: Optional[str] = Field(None, max_length=50)
    description_prompt_version: Optional[str] = Field(None, max_length=50)
    description_input_fingerprint: Optional[str] = Field(None, max_length=100)
    
    category: Optional[str] = Field(None, max_length=100)
    presence: Optional[PresenceType] = None
    
    website: Optional[str] = Field(None, max_length=500, description="HTTPS website URL")
    
    expected_revision: int = Field(..., description="Concurrency control")
    
    model_config = ConfigDict(extra="forbid")

class IdentityFormResponse(IdentityForm):
    space_id: Optional[uuid.UUID] = None
    revision: int

class HandleCheckRequest(BaseModel):
    handle: str = Field(..., min_length=3, max_length=50)
    
    model_config = ConfigDict(extra="forbid")

class HandleCheckResponse(BaseModel):
    valid: bool
    reason: Optional[str] = None

class HandleChangeRequest(BaseModel):
    handle: str = Field(..., min_length=3, max_length=50)
    expected_revision: int
    
    model_config = ConfigDict(extra="forbid")


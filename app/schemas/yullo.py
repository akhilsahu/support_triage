from pydantic import BaseModel, Field, ConfigDict
import uuid
from typing import Optional, List
from datetime import datetime

class YulloConfigSchema(BaseModel):
    """
    JSON schema for Yullo-specific configuration.
    """
    theme_color: Optional[str] = Field(default="#000000", description="Main theme color")
    enable_features: List[str] = Field(default_factory=list, description="Enabled Yullo features")
    
    model_config = ConfigDict(extra="forbid")

class YulloSpaceCreate(BaseModel):
    """
    Strict schema for creating a Yullo space. 
    It intentionally forbids all legacy support247 fields (like email, password_hash, sla_rules, etc).
    """
    name: str = Field(..., max_length=200, description="Display name for the Yullo space")
    slug: str = Field(..., max_length=80, description="URL-friendly identifier")
    
    # We strictly forbid extra fields
    model_config = ConfigDict(extra="forbid")

class YulloSpaceResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    product: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

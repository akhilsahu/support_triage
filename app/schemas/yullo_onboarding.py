from pydantic import BaseModel, Field, constr
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

class SpaceSourceResponse(BaseModel):
    id: uuid.UUID
    source_type: str
    content_ref: str
    status: str
    title: Optional[str] = None
    facts: List[Dict[str, Any]] = []
    target_badges: List[str] = ["About", "Category", "Aura knowledge"]
    preview_excerpt: Optional[str] = None
    page_count: Optional[int] = None
    chunk_count: Optional[int] = None
    is_confirmed: bool = False
    is_scanned: Optional[bool] = False
    prompt_version: Optional[str] = "v1"
    source_version: Optional[int] = 1
    error_msg: Optional[str] = None
    progress: Optional[int] = None
    stage: Optional[str] = None
    eta_seconds: Optional[int] = None
    fact_extraction_status: Optional[str] = None
    fact_extraction_error: Optional[str] = None
    entity_extraction_status: Optional[str] = None
    entity_extraction_error: Optional[str] = None
    favicon_url: Optional[str] = None
    preview_image_url: Optional[str] = None
    assets: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True

class SourceUpdateRequest(BaseModel):
    is_confirmed: Optional[bool] = None

class DraftSpaceResponse(BaseModel):
    id: uuid.UUID
    purpose: Optional[str]
    name: str # maps to Space.display_name
    handle: str # maps to Space.slug
    image_url: Optional[str] # maps to Space.logo_url
    current_step: str
    status: str
    sources: List[SpaceSourceResponse] = []

    class Config:
        from_attributes = True

class OnboardingDraftCreate(BaseModel):
    purpose: str = Field(..., description="person | creator | business | organization")

class OnboardingDraftUpdate(BaseModel):
    name: Optional[str] = None
    purpose: Optional[str] = None
    handle: Optional[str] = None
    description: Optional[str] = None
    description_source: Optional[str] = None
    category: Optional[str] = None
    category_source: Optional[str] = None
    logo_url: Optional[str] = None
    image_url: Optional[str] = None

class HandleValidateRequest(BaseModel):
    handle: str

class HandleValidateResponse(BaseModel):
    valid: bool
    reason: Optional[str] = None

class SourceUrlRequest(BaseModel):
    space_id: Optional[uuid.UUID] = None
    url: str
    title: Optional[str] = None
    source_type: str = Field("website", description="website | instagram | linkedin | youtube | other")

class SourceTextRequest(BaseModel):
    space_id: Optional[uuid.UUID] = None
    text: str
    title: Optional[str] = None

class PreviewRequest(BaseModel):
    regenerate: bool = False

class IdentityClaim(BaseModel):
    text: str
    source_id: str
    evidence_excerpt: str

class IdentitySuggestion(BaseModel):
    status: str = Field("ready", description="ready | insufficient_context | needs_clarification | unavailable")
    description: Optional[str] = None
    category: Optional[str] = None
    claims: List[IdentityClaim] = []
    clarification: Optional[str] = None

class GenerateSummaryRequest(BaseModel):
    space_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    website: Optional[str] = None
    sources: Optional[List[dict]] = None

class GenerateSummaryResponse(BaseModel):
    status: str = Field(..., description="ready | insufficient_context | needs_clarification | unavailable")
    description: Optional[str] = None
    category: Optional[str] = None
    claims: List[IdentityClaim] = []
    clarification: Optional[str] = None
    prompt_version: str = "identity-v2"
    input_fingerprint: Optional[str] = None
    context_version: int = 1

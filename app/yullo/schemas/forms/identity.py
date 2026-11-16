import uuid
from pydantic import BaseModel, Field, ConfigDict, StrictBool
from typing import Optional
from enum import Enum
from app.yullo.schemas.spaces import SpaceType, QuickSpaceContext, SUBSPACE_DESCRIPTION_LIMIT
from app.yullo.schemas.appearance import SpacePresentationConfig
from app.yullo.schemas.spaces import SubspaceFields

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
    quick_context: QuickSpaceContext | None = None
    parent_space_id: Optional[uuid.UUID] = None
    space_type: SpaceType = SpaceType.space
    type_label: Optional[str] = Field(None, max_length=60)
    logo_url: Optional[str] = None
    display_name: Optional[str] = Field("Unnamed Space", max_length=200)
    slug: Optional[str] = Field(None, max_length=50)
    purpose: Optional[SpacePurpose] = Field(SpacePurpose.business)
    description: Optional[str] = Field(None, max_length=SUBSPACE_DESCRIPTION_LIMIT)
    description_source: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=100)
    presence: Optional[PresenceType] = None
    website: Optional[str] = Field(None, max_length=500)
    
    model_config = ConfigDict(extra="forbid")


class IdentityForm(BaseModel):
    purpose: SpacePurpose = Field(..., description="Canonical space purpose")
    display_name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=3, max_length=50)
    logo_url: Optional[str] = Field(None, description="Image URL or base64 data URL")
    
    description: Optional[str] = Field(None, max_length=280)
    description_source: Optional[str] = Field(None, max_length=50)
    description_prompt_version: Optional[str] = Field(None, max_length=50)
    description_input_fingerprint: Optional[str] = Field(None, max_length=100)
    
    category: Optional[str] = Field(None, max_length=100)
    category_source: Optional[str] = Field(None, max_length=50)
    presence: Optional[PresenceType] = None
    
    website: Optional[str] = Field(None, max_length=500, description="HTTPS website URL")
    
    model_config = ConfigDict(extra="forbid")

class IdentityFormUpdate(BaseModel):
    explore_discovery: StrictBool | None = None
    subspace_fields: SubspaceFields | None = None
    purpose: Optional[SpacePurpose] = None
    display_name: Optional[str] = Field(None, min_length=1, max_length=200)
    logo_url: Optional[str] = Field(None, description="Image URL or base64 data URL")
    
    description: Optional[str] = Field(None, max_length=SUBSPACE_DESCRIPTION_LIMIT)
    description_source: Optional[str] = Field(None, max_length=50)
    description_prompt_version: Optional[str] = Field(None, max_length=50)
    description_input_fingerprint: Optional[str] = Field(None, max_length=100)
    
    category: Optional[str] = Field(None, max_length=100)
    category_source: Optional[str] = Field(None, max_length=50)
    presence: Optional[PresenceType] = None
    
    website: Optional[str] = Field(None, max_length=500, description="HTTPS website URL")
    
    expected_revision: int = Field(..., description="Concurrency control")
    
    model_config = ConfigDict(extra="forbid")

class IdentityFormResponse(IdentityForm):
    explore_discovery: bool = False
    space_type: SpaceType = SpaceType.space
    type_label: Optional[str] = None
    subspace_fields: SubspaceFields | None = None
    presentation_config: SpacePresentationConfig | None = None
    description: Optional[str] = Field(None, max_length=SUBSPACE_DESCRIPTION_LIMIT)
    parent_space_id: Optional[uuid.UUID] = None
    event_context: QuickSpaceContext | None = None
    space_id: Optional[uuid.UUID] = None
    revision: int
    status: Optional[str] = None

class ToggleLiveRequest(BaseModel):
    live: bool
    
    model_config = ConfigDict(extra="forbid")

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


class CategorySuggestionItem(BaseModel):
    id: uuid.UUID
    name: str
    purpose: Optional[str] = None
    is_popular: bool = False
    usage_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CategorySuggestionsResponse(BaseModel):
    items: list[CategorySuggestionItem]



def validate_logo_url(value: str | None) -> str | None:
    """Shared request/service boundary for the existing inline identity image field."""
    import base64
    from urllib.parse import urlsplit
    if not value:
        return value
    if len(value) > 7_000_000:
        raise ValueError("Choose an image up to 5 MB")
    if value.startswith("data:"):
        header, separator, body = value.partition(",")
        if header not in {f"data:image/{kind};base64" for kind in ("png", "jpeg", "webp", "gif", "svg+xml")} or not separator:
            raise ValueError("Choose a supported image")
        try:
            decoded = base64.b64decode(body, validate=True)
        except ValueError:
            raise ValueError("Choose a valid image") from None
        if not decoded or len(decoded) > 5 * 1024 * 1024:
            raise ValueError("Choose an image up to 5 MB")
    else:
        url = urlsplit(value)
        if url.scheme not in ("https", "http") or not url.hostname or url.username or url.password:
            raise ValueError("Use an HTTP or HTTPS image URL")
    return value

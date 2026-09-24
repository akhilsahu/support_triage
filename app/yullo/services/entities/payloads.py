from typing import Literal, Optional, List
from datetime import datetime
import re
from pydantic import BaseModel, HttpUrl, Field, field_validator, model_validator, ConfigDict, AnyUrl

EntityType = Literal['offering', 'location', 'portfolio_item', 'contact_channel', 'person', 'event', 'action']

class BaseEntityPayload(BaseModel):
    model_config = ConfigDict(extra='forbid')

def _ensure_https_url(url: Optional[HttpUrl]) -> Optional[str]:
    if url is None:
        return None
    url_str = str(url)
    if not url_str.startswith("https://"):
        raise ValueError("URL must use secure HTTPS protocol (https://)")
    return url_str

class OfferingPayload(BaseEntityPayload):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=4000)
    price_amount: Optional[str] = Field(None, pattern=r'^\d+(\.\d+)?$')
    currency: Optional[str] = Field(None, min_length=3, max_length=3, pattern=r'^[A-Z]{3}$')
    duration_minutes: Optional[int] = Field(None, gt=0)

    @model_validator(mode='after')
    def check_price_and_currency(self) -> 'OfferingPayload':
        if self.price_amount is not None and not self.currency:
            raise ValueError('currency must be provided if price_amount is set')
        if self.currency is not None and self.price_amount is None:
            raise ValueError('price_amount must be provided if currency is set')
        return self

class LocationPayload(BaseEntityPayload):
    name: str = Field(..., min_length=1, max_length=200)
    address: str = Field(..., min_length=1, max_length=1000)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    map_url: Optional[HttpUrl] = None

    @field_validator('map_url')
    @classmethod
    def validate_map_url(cls, v: Optional[HttpUrl]) -> Optional[HttpUrl]:
        if v is not None:
            _ensure_https_url(v)
        return v

    @model_validator(mode='after')
    def check_coordinates(self) -> 'LocationPayload':
        lat = self.latitude
        lng = self.longitude
        if (lat is not None and lng is None) or (lat is None and lng is not None):
            raise ValueError('Both latitude and longitude must be provided together')
        return self

class PortfolioItemPayload(BaseEntityPayload):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=4000)
    media_urls: Optional[List[HttpUrl]] = Field(None, max_length=10)
    project_url: Optional[HttpUrl] = None

    @field_validator('project_url')
    @classmethod
    def validate_project_url(cls, v: Optional[HttpUrl]) -> Optional[HttpUrl]:
        if v is not None:
            _ensure_https_url(v)
        return v

    @field_validator('media_urls')
    @classmethod
    def validate_media_urls(cls, v: Optional[List[HttpUrl]]) -> Optional[List[HttpUrl]]:
        if v:
            for url in v:
                _ensure_https_url(url)
        return v

class ContactChannelPayload(BaseEntityPayload):
    label: str = Field(..., min_length=1, max_length=200)
    channel: Literal['email', 'phone', 'website']
    value: str = Field(..., min_length=1, max_length=500)

    @model_validator(mode='after')
    def validate_channel_value(self) -> 'ContactChannelPayload':
        val = self.value.strip()
        if self.channel == 'email':
            email_pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
            if not re.match(email_pattern, val):
                raise ValueError(f"Invalid email address value for contact channel: {val}")
        elif self.channel == 'phone':
            phone_pattern = r'^\+?[0-9\s\-\(\)\.]{7,25}$'
            if not re.match(phone_pattern, val):
                raise ValueError(f"Invalid phone number value for contact channel: {val}")
        elif self.channel == 'website':
            if not val.startswith("https://"):
                raise ValueError("Website contact channel URL must start with https://")
        return self

class PersonPayload(BaseEntityPayload):
    name: str = Field(..., min_length=1, max_length=200)
    role: Optional[str] = Field(None, max_length=200)
    bio: Optional[str] = Field(None, max_length=4000)
    image_url: Optional[HttpUrl] = None

    @field_validator('image_url')
    @classmethod
    def validate_image_url(cls, v: Optional[HttpUrl]) -> Optional[HttpUrl]:
        if v is not None:
            _ensure_https_url(v)
        return v

class EventPayload(BaseEntityPayload):
    title: str = Field(..., min_length=1, max_length=200)
    starts_at: str # UTC ISO format
    ends_at: Optional[str] = None
    location_entity_id: Optional[str] = None
    registration_url: Optional[HttpUrl] = None

    @field_validator('registration_url')
    @classmethod
    def validate_reg_url(cls, v: Optional[HttpUrl]) -> Optional[HttpUrl]:
        if v is not None:
            _ensure_https_url(v)
        return v

    @model_validator(mode='after')
    def validate_timestamps(self) -> 'EventPayload':
        try:
            start_dt = datetime.fromisoformat(self.starts_at.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError(f"starts_at must be a valid ISO datetime format string: {self.starts_at}")
        
        if self.ends_at:
            try:
                end_dt = datetime.fromisoformat(self.ends_at.replace("Z", "+00:00"))
            except ValueError:
                raise ValueError(f"ends_at must be a valid ISO datetime format string: {self.ends_at}")
            
            if end_dt < start_dt:
                raise ValueError("ends_at timestamp must be after or equal to starts_at timestamp")
        return self

class ActionPayload(BaseEntityPayload):
    label: str = Field(..., min_length=1, max_length=200)
    kind: Literal['booking', 'enquiry', 'external_link']
    destination_url: HttpUrl

    @field_validator('destination_url')
    @classmethod
    def validate_dest_url(cls, v: HttpUrl) -> HttpUrl:
        _ensure_https_url(v)
        return v

PAYLOAD_SCHEMAS = {
    ('offering', 1): OfferingPayload,
    ('location', 1): LocationPayload,
    ('portfolio_item', 1): PortfolioItemPayload,
    ('contact_channel', 1): ContactChannelPayload,
    ('person', 1): PersonPayload,
    ('event', 1): EventPayload,
    ('action', 1): ActionPayload,
}

def validate_entity_payload(entity_type: EntityType, schema_version: int, payload: dict) -> dict:
    schema_class = PAYLOAD_SCHEMAS.get((entity_type, schema_version))
    if not schema_class:
        raise ValueError(f"Unsupported entity type/version: {entity_type} v{schema_version}")
    
    # Run Pydantic validation and return the serialized JSON payload
    validated = schema_class(**payload)
    return validated.model_dump(mode='json') if hasattr(validated, 'model_dump') else validated.dict()


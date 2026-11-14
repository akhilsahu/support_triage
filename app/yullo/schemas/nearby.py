from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NearbyArea(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    latitude: float | None = Field(None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(None, ge=-180, le=180, allow_inf_nan=False)
    city: str | None = Field(None, min_length=1, max_length=120)
    region: str | None = Field(None, min_length=1, max_length=120)
    country_code: str | None = Field(None, pattern=r"^[A-Z]{2}$")

    @model_validator(mode="after")
    def validate_area(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Both coordinates are required")
        if (self.city or self.region) and not self.country_code:
            raise ValueError("City or region requires a country code")
        return self


class NearbyRequest(NearbyArea):
    location_id: UUID | None = None
    scope: Literal["all", "nearby", "city", "remote"] = "all"

    @model_validator(mode="after")
    def validate_origin(self):
        if self.location_id and any(value is not None for value in (
            self.latitude, self.longitude, self.city, self.region, self.country_code,
        )):
            raise ValueError("Choose a saved location or supply an area")
        return self


class NearbyOrigin(NearbyArea):
    id: UUID
    name: str
    space_id: UUID
    space_name: str


class NearbyItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["space", "event"]
    space_id: UUID
    space_name: str
    slug: str
    title: str
    area_label: str
    tier: Literal["nearby", "city", "region", "country", "remote"]
    distance_km: float | None = None
    starts_at: datetime | None = None


class NearbyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[NearbyItem]
    radius_km: float
    limit: int

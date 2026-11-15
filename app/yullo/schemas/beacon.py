from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.yullo.schemas.nearby import NearbyArea, BeaconReach
from app.yullo.config.beacon import NEARBY_REACHES


class BeaconSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reach: BeaconReach
    radius_km: int | None = Field(None, ge=10, le=100)
    target_area: NearbyArea = Field(default_factory=NearbyArea)
    origin_location_entity_id: UUID | None = None
    expires_at: AwareDatetime

    @model_validator(mode="after")
    def valid_target(self):
        if self.reach == "nearby" and self.radius_km is None:
            raise ValueError("Choose a radius between 10 and 100 km")
        if self.reach not in NEARBY_REACHES and self.radius_km is not None:
            raise ValueError("Radius applies only to nearby reach")
        if self.origin_location_entity_id:
            return self  # Resolve and revalidate the same-Space location in the service.
        if self.reach in NEARBY_REACHES and self.target_area.latitude is None:
            raise ValueError("Choose a map location for nearby reach")
        if self.reach == "city" and not (self.target_area.city and self.target_area.country_code):
            raise ValueError("City and country are required")
        if self.reach == "country" and not self.target_area.country_code:
            raise ValueError("Country is required")
        return self


class BeaconRevision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)


class BeaconUpdate(BeaconRevision):
    config: BeaconSettings


class BeaconResponse(BaseModel):
    config: BeaconSettings | None = None
    revision: int = 0
    status: Literal["inactive", "active", "paused", "expired", "unavailable"] = "inactive"
    can_activate: bool = False
    enabled: bool = True
    target_changed: bool = False
    event_expires_at: AwareDatetime | None = None
    default_expires_at: AwareDatetime | None = None
    latest_expires_at: AwareDatetime | None = None


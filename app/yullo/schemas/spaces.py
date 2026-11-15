import uuid
from enum import Enum
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl, model_validator, field_validator
from app.yullo.services.entities.payloads import PriceFields


SUBSPACE_DESCRIPTION_LIMIT = 4000
PROFILE_DESCRIPTION_LIMIT = 280

def space_description_limit(parent_space_id):
    return SUBSPACE_DESCRIPTION_LIMIT if parent_space_id is not None else PROFILE_DESCRIPTION_LIMIT


class SpaceType(str, Enum):
    space = "space"
    event = "event"
    project = "project"
    location = "location"
    community = "community"
    service = "service"
    job = "job"
    other = "other"
    posting = "posting"


TYPE_LABELS = {"posting": "Post", **{value.value: value.value.capitalize() for value in SpaceType if value != SpaceType.posting}}
TYPE_ALIASES = {**{label.casefold(): key for key, label in TYPE_LABELS.items()}, "posting": "posting", "announcement": "posting"}


def resolve_space_type(space_type, type_label=None):
    """Labels customize presentation; the existing enum retains behavioral routing."""
    if type_label is None or not type_label.strip():
        kind = SpaceType(space_type)
        return kind, TYPE_LABELS[kind.value]
    label = " ".join(type_label.split())
    if len(label) > 60:
        raise ValueError("Type must be at most 60 characters")
    kind = SpaceType(TYPE_ALIASES.get(label.casefold(), "other"))
    return kind, "Announcement" if label.casefold() == "announcement" else TYPE_LABELS[kind.value] if label.casefold() in TYPE_ALIASES else label


def saved_type_label(space_type, settings=None):
    identity = (settings or {}).get("identity") or {}
    return identity.get("type_label") or TYPE_LABELS.get(str(space_type), str(space_type).capitalize())


class DetailField(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    label: str = Field(min_length=1, max_length=60)
    value: str = Field(min_length=1, max_length=300)


class SubspaceFields(PriceFields):
    price_amount: str | None = Field(None, pattern=r"^\d{1,10}(\.\d{1,2})?$")
    details: list[DetailField] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def unique_fields(self):
        if len({detail.id for detail in self.details}) != len(self.details):
            raise ValueError("Detail fields must be unique")
        return self


class QuickSpaceContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subspace_fields: SubspaceFields = Field(default_factory=SubspaceFields)
    starts_at: AwareDatetime | None = None
    place: str = Field("", max_length=300)
    destination_url: HttpUrl | None = None
    copied_company_revision: int | None = Field(None, ge=1)
    location_mode: Literal["online", "physical"] | None = None
    meeting_url: HttpUrl | None = None
    latitude: float | None = Field(None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(None, ge=-180, le=180, allow_inf_nan=False)
    map_url: HttpUrl | None = None

    @model_validator(mode="after")
    def validate_location(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together")
        if self.location_mode != "physical" and (self.latitude is not None or self.map_url is not None):
            raise ValueError("Map details require a physical location")
        if self.meeting_url is not None and self.location_mode != "online":
            raise ValueError("Meeting links require an online location")
        if self.location_mode == "online" and self.place.strip():
            raise ValueError("Online locations cannot include a physical address")
        return self


class QuickDescriptionRequest(BaseModel):
    time_zone: str | None = Field(default=None, max_length=64)
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    space_type: SpaceType
    type_label: str | None = Field(None, max_length=60)
    description: str = Field("", max_length=SUBSPACE_DESCRIPTION_LIMIT)
    context: QuickSpaceContext = Field(default_factory=QuickSpaceContext)


    @field_validator("time_zone")
    @classmethod
    def valid_time_zone(cls, value):
        if value is not None:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValueError("Use a valid time zone") from None
        return value


class QuickDescriptionResponse(BaseModel):
    description: str = Field(max_length=SUBSPACE_DESCRIPTION_LIMIT)


class HierarchySpace(BaseModel):
    logo_url: str | None = None
    starts_at: str | None = None
    location_label: str | None = None
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    name: str
    slug: str
    parent_space_id: uuid.UUID | None = None
    space_type: SpaceType
    type_label: str | None = Field(None, max_length=60)
    revision: int
    status: str
    active: bool


class HierarchyPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parent_space_id: uuid.UUID | None = None
    space_type: SpaceType | None = None
    type_label: str | None = Field(None, max_length=60)
    expected_revision: int = Field(ge=1)

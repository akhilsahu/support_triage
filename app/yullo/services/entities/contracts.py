from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SpaceEntityDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    space_id: UUID
    identity_key: str
    entity_type: str
    schema_version: int
    payload_json: dict[str, Any]
    origin_type: str
    review_status: str
    is_active: bool
    is_public: bool
    revision: int
    created_at: datetime
    updated_at: datetime


class EntityEvidenceDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_item_id: UUID
    source_version: int
    source_title: str | None = None
    source_locator: str | None = None
    locator_metadata: dict[str, Any] | None = None


class SourceEntityDTO(SpaceEntityDTO):
    evidence: list[EntityEvidenceDTO] = Field(default_factory=list)


class EntityCommand(BaseModel):
    identity_key: str | None = None
    entity_type: str
    schema_version: int = 1
    payload_json: dict[str, Any]
    is_public: bool = False


class EntityPatch(BaseModel):
    payload_json: dict[str, Any] | None = None
    is_active: bool | None = None
    is_public: bool | None = None
    review_status: str | None = None
    expected_revision: int | None = None


class BulkEntityPatch(BaseModel):
    entity_ids: list[UUID]
    is_active: bool | None = None
    is_public: bool | None = None
    review_status: str | None = None


class ValidatedEntityCandidate(BaseModel):
    entity_type: str
    schema_version: int = 1
    payload_json: dict[str, Any]
    evidence_locators: list[dict[str, Any]]

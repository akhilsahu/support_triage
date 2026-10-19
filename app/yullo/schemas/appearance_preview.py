from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.yullo.schemas.appearance import SpacePresentationConfig


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PreviewSectionType(str, Enum):
    services = "services"
    portfolio = "portfolio"
    products = "products"
    location = "location"
    featured = "featured"
    prompt_starters = "prompt_starters"


class PreviewContentSource(str, Enum):
    example = "example"
    grounded = "grounded"


class AppearancePreviewItem(StrictModel):
    key: str
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    meta: str | None = Field(default=None, max_length=100)
    source: PreviewContentSource
    source_entity_id: str | None = Field(default=None, alias="sourceEntityId")
    source_fact_ids: list[UUID] = Field(default_factory=list, alias="sourceFactIds", max_length=8)
    image_url: str | None = Field(default=None, alias="imageUrl")
    asset_id: str | None = Field(default=None, alias="assetId")

    @model_validator(mode="after")
    def validate_source(self):
        if self.source == PreviewContentSource.grounded and not (self.source_entity_id or self.source_fact_ids):
            raise ValueError("Grounded items require entity or fact references")
        return self


class AppearancePreviewSection(StrictModel):
    type: PreviewSectionType
    eyebrow: str | None = Field(default=None, max_length=60)
    heading: str = Field(min_length=1, max_length=100)
    items: list[AppearancePreviewItem] = Field(max_length=4)


class AppearancePreviewContent(StrictModel):
    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    sections: list[AppearancePreviewSection]

    @model_validator(mode="after")
    def validate_sections(self):
        types = [s.type for s in self.sections]
        if len(types) != len(set(types)):
            raise ValueError("At most one section of each type")
        return self


class AppearancePreviewRequest(StrictModel):
    current_config: SpacePresentationConfig = Field(alias="currentConfig")
    force: bool = False
    section_type: PreviewSectionType | None = Field(default=None, alias="sectionType")


class AppearancePreviewApplyRequest(StrictModel):
    section: AppearancePreviewSection


class PreviewStatus(str, Enum):
    ready = "ready"
    insufficient_context = "insufficient_context"
    unavailable = "unavailable"


class AppearancePreviewResponse(StrictModel):
    status: PreviewStatus
    content: AppearancePreviewContent | None = None
    explanation: str
    grounded_entity_ids: list[str] = Field(default_factory=list, alias="groundedEntityIds")
    grounded_fact_ids: list[UUID] = Field(default_factory=list, alias="groundedFactIds")
    input_fingerprint: str = Field(alias="inputFingerprint")


class AppearanceRebuildLayoutRequest(StrictModel):
    force: bool = False


class AppearanceRebuildLayoutResponse(StrictModel):
    config: SpacePresentationConfig
    preview_content: AppearancePreviewContent = Field(alias="previewContent")
    explanation: str
    grounded_entity_ids: list[str] = Field(default_factory=list, alias="groundedEntityIds")


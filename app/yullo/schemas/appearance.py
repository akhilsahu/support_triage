from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.yullo.schemas.spaces import SubspaceFields


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class LandingEmphasis(str, Enum):
    balanced = "balanced"
    visual = "visual"
    services = "services"
    local = "local"
    minimal = "minimal"


class Accent(str, Enum):
    yullo = "yullo"
    blue = "blue"
    cyan = "cyan"
    violet = "violet"
    coral = "coral"
    forest = "forest"
    neutral = "neutral"


class BackgroundTreatment(str, Enum):
    soft = "soft"
    light = "light"
    dark = "dark"
    image = "image"


class HeroLayout(str, Enum):
    centered = "centered"
    image_left = "image_left"
    image_right = "image_right"
    image_background = "image_background"


class SectionType(str, Enum):
    identity = "identity"
    services = "services"
    portfolio = "portfolio"
    products = "products"
    location = "location"
    featured = "featured"
    prompt_starters = "prompt_starters"
    upcoming_events = "upcoming_events"


class VisualDensity(str, Enum):
    minimal = "minimal"
    balanced = "balanced"
    expressive = "expressive"


class NetworkIntensity(str, Enum):
    none = "none"
    very_low = "very_low"
    low = "low"


class ContentLayout(str, Enum):
    left = "left"
    center = "center"
    right = "right"
    stretch = "stretch"


class PresentationSource(str, Enum):
    default = "default"
    aura = "aura"
    owner = "owner"


THEME_PRESETS = {
    "clean", "professional", "technical", "warm", "editorial", "visual",
    "bold", "minimal", "personal", "community", "trustworthy",
}


class HeroConfig(StrictModel):
    visible: bool = True
    asset_id: UUID | None = Field(default=None, alias="assetId")
    layout: HeroLayout = HeroLayout.centered


class PresentationSection(StrictModel):
    type: SectionType
    variant: Annotated[str | None, Field(max_length=80)] = None
    visible: bool = True


class SpacePresentationConfig(StrictModel):
    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    theme_preset: str = Field(alias="themePreset", min_length=1, max_length=40)
    landing_emphasis: LandingEmphasis = Field(alias="landingEmphasis")
    accent: Accent
    accent_color: str | None = Field(default=None, alias="accentColor", pattern=r"^#[0-9a-fA-F]{6}$")
    background_treatment: BackgroundTreatment = Field(alias="backgroundTreatment")
    hero: HeroConfig = Field(default_factory=HeroConfig)
    sections: list[PresentationSection]
    content_layout: ContentLayout = Field(default=ContentLayout.center, alias="contentLayout")
    visual_density: VisualDensity = Field(alias="visualDensity")
    network_intensity: NetworkIntensity = Field(alias="networkIntensity")
    presentation_source: PresentationSource = Field(alias="presentationSource")

    @field_validator("theme_preset")
    @classmethod
    def validate_theme_preset(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in THEME_PRESETS:
            raise ValueError("Unsupported theme preset")
        return normalized

    @model_validator(mode="after")
    def validate_sections(self):
        section_types = [section.type for section in self.sections]
        if len(section_types) != len(set(section_types)):
            raise ValueError("Presentation sections must be unique")
        if SectionType.identity not in section_types:
            raise ValueError("Identity section is required")
        if SectionType.upcoming_events not in section_types:
            index = section_types.index(SectionType.identity) + 1
            self.sections.insert(index, PresentationSection(type=SectionType.upcoming_events))
        return self


class AppearanceUpdateRequest(StrictModel):
    config: SpacePresentationConfig
    expected_revision: int = Field(alias="expectedRevision", ge=1)
    discard_editor_draft: bool = Field(default=False, alias="discardEditorDraft")


class AppearanceCommandRequest(StrictModel):
    instruction: str = Field(min_length=2, max_length=500)
    current_config: SpacePresentationConfig = Field(alias="currentConfig")


class AppearanceCandidateResponse(StrictModel):
    config: SpacePresentationConfig
    explanation: str = Field(max_length=240)
    changed_paths: list[str] = Field(default_factory=list, alias="changedPaths")


class PageAction(StrictModel):
    id: str
    label: str
    url: str


class PreviewPageAction(PageAction):
    visible_on_page: bool = Field(alias="visibleOnPage")


class SpacePageDetails(StrictModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    is_remote: bool = Field(default=False, alias="isRemote")
    space_type: str = Field(default="space", alias="spaceType")
    type_label: str | None = Field(default=None, alias="typeLabel")
    starts_at: str | None = Field(default=None, alias="startsAt")
    ends_at: str | None = Field(default=None, alias="endsAt")
    location_label: str | None = Field(default=None, alias="locationLabel")
    location_url: str | None = Field(default=None, alias="locationUrl")


class UpcomingEvent(StrictModel):
    title: str
    url: str
    cover_url: str | None = None
    starts_at: str
    location: dict[str, str] | None = None
    is_remote: bool | None = None


class AppearanceSpaceSummary(StrictModel):
    upcoming_events: list[UpcomingEvent] = Field(default_factory=list, alias="upcomingEvents")
    preview_booking_links: list[PreviewPageAction] = Field(default_factory=list, alias="previewBookingLinks")
    prompt_starters: list[str] = Field(default_factory=list, alias="promptStarters")
    booking_links: list[PageAction] = Field(default_factory=list, alias="bookingLinks")
    page_details: SpacePageDetails | None = Field(default=None, alias="pageDetails")
    subspace_fields: SubspaceFields | None = Field(default=None, alias="subspaceFields")
    is_subspace: bool = Field(default=False, alias="isSubspace")
    id: UUID
    display_name: str = Field(alias="displayName")
    slug: str
    status: str
    purpose: str
    category: str | None = None
    description: str | None = None
    logo_url: str | None = Field(default=None, alias="logoUrl")


class AppearanceAssetResponse(StrictModel):
    id: UUID
    filename: str
    mime_type: str = Field(alias="mimeType")
    byte_size: int = Field(alias="byteSize")
    width: int
    height: int
    alt_text: str | None = Field(default=None, alias="altText")
    url: str
    thumbnail_url: str = Field(alias="thumbnailUrl")
    source_type: Literal["upload", "extracted"] = Field(default="upload", alias="sourceType")


class AppearanceAssetUpdateRequest(StrictModel):
    alt_text: str | None = Field(default=None, alias="altText", max_length=300)


class AppearanceResponse(StrictModel):
    space: AppearanceSpaceSummary
    published_config: SpacePresentationConfig = Field(alias="publishedConfig")
    effective_config: SpacePresentationConfig = Field(alias="effectiveConfig")
    recommendation: AppearanceCandidateResponse | None = None
    assets: list[AppearanceAssetResponse] = Field(default_factory=list)
    revision: int


PURPOSE_PRESETS: dict[str, tuple[str, ...]] = {
    "business": ("clean", "professional", "technical", "warm"),
    "creator": ("editorial", "visual", "bold", "warm"),
    "person": ("minimal", "personal", "editorial", "professional"),
    "organization": ("community", "trustworthy", "editorial", "bold"),
}


def default_presentation_config(purpose: str | None, *, is_subspace: bool = False) -> SpacePresentationConfig:
    normalized = (purpose or "business").lower()
    if normalized not in PURPOSE_PRESETS:
        normalized = "business"
    defaults = {
        "business": ("clean", LandingEmphasis.services),
        "creator": ("editorial", LandingEmphasis.visual),
        "person": ("minimal", LandingEmphasis.minimal),
        "organization": ("community", LandingEmphasis.balanced),
    }
    theme, emphasis = defaults[normalized]
    return SpacePresentationConfig(
        themePreset=theme,
        landingEmphasis=emphasis,
        accent=Accent.yullo,
        backgroundTreatment=BackgroundTreatment.soft,
        hero=HeroConfig(layout=HeroLayout.image_left if is_subspace else HeroLayout.centered),
        contentLayout=ContentLayout.left if is_subspace else ContentLayout.center,
        sections=[
            PresentationSection(type=SectionType.identity),
            PresentationSection(type=SectionType.services),
            PresentationSection(type=SectionType.portfolio),
            PresentationSection(type=SectionType.location),
            PresentationSection(type=SectionType.prompt_starters),
        ],
        visualDensity=VisualDensity.balanced,
        networkIntensity=NetworkIntensity.very_low,
        presentationSource=PresentationSource.default,
    )

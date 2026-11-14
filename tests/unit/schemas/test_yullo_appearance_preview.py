import pytest
from pydantic import ValidationError

from app.yullo.schemas.appearance_preview import (
    AppearancePreviewContent,
    AppearancePreviewItem,
    AppearancePreviewSection,
    PreviewContentSource,
    PreviewSectionType,
)


def test_valid_preview_content():
    content = AppearancePreviewContent(
        schemaVersion=1,
        sections=[
            AppearancePreviewSection(
                type=PreviewSectionType.services,
                heading="Our Services",
                items=[
                    AppearancePreviewItem(
                        key="services:123",
                        title="Web Dev",
                        source=PreviewContentSource.grounded,
                        sourceEntityId="123",
                    )
                ],
            )
        ],
    )
    assert content.schema_version == 1


def test_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        AppearancePreviewItem(
            key="123",
            title="Title",
            source=PreviewContentSource.example,
            unknown="field",  # type: ignore
        )


def test_rejects_duplicate_section_types():
    with pytest.raises(ValidationError, match="At most one section"):
        AppearancePreviewContent(
            schemaVersion=1,
            sections=[
                AppearancePreviewSection(type=PreviewSectionType.services, heading="1", items=[]),
                AppearancePreviewSection(type=PreviewSectionType.services, heading="2", items=[]),
            ],
        )


def test_rejects_oversized_items():
    with pytest.raises(ValidationError):
        AppearancePreviewSection(
            type=PreviewSectionType.services,
            heading="Services",
            items=[
                AppearancePreviewItem(key="1", title="1", source=PreviewContentSource.example),
                AppearancePreviewItem(key="2", title="2", source=PreviewContentSource.example),
                AppearancePreviewItem(key="3", title="3", source=PreviewContentSource.example),
                AppearancePreviewItem(key="4", title="4", source=PreviewContentSource.example),
                AppearancePreviewItem(key="5", title="5", source=PreviewContentSource.example),
            ],
        )


def test_grounded_items_require_authorized_references():
    with pytest.raises(ValidationError, match="Grounded items require entity, fact or chunk references"):
        AppearancePreviewItem(
            key="1",
            title="Title",
            source=PreviewContentSource.grounded,
        )


def test_limits_length():
    with pytest.raises(ValidationError):
        AppearancePreviewItem(
            key="1",
            title="A" * 121,
            source=PreviewContentSource.example,
        )

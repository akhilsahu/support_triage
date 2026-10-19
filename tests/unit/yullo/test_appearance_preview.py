import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import json
from types import SimpleNamespace
from fastapi import HTTPException

from app.yullo.services.appearance_preview import (
    PreviewGenerationContext,
    build_preview_fingerprint,
    collect_preview_context,
    merge_applied_sections,
)


@pytest.mark.asyncio
@patch("app.yullo.services.appearance_preview.collect_preview_facts", new_callable=AsyncMock, return_value=[])
async def test_section_build_calls_llm_with_only_requested_section(_facts):
    from app.yullo.schemas.appearance import default_presentation_config
    from app.yullo.schemas.appearance_preview import AppearancePreviewRequest
    from app.yullo.services.appearance_preview import generate_appearance_preview

    context = PreviewGenerationContext("Space", "business", None, None, False, [
        {"id": "service", "revision": 1, "type": "offering", "title": "Consulting"},
        {"id": "product", "revision": 1, "type": "offering", "kind": "product", "title": "Guide"},
    ])
    content = {"schemaVersion": 1, "sections": [{"type": "services", "heading": "How we help", "items": [
        {"key": "ignored", "title": "Consulting support", "source": "grounded", "sourceEntityId": "service"}
    ]}]}
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(content)))]))
    with patch("app.yullo.services.appearance_preview.collect_preview_context", AsyncMock(return_value=context)), patch("app.yullo.services.appearance_preview.get_async_openai_clients", return_value=[("test", client, "test-model")]):
        result = await generate_appearance_preview(AsyncMock(), user_id=uuid.uuid4(), space_id=uuid.uuid4(), request=AppearancePreviewRequest(currentConfig=default_presentation_config(None), sectionType="services", force=True))
    sent = json.loads(client.chat.completions.create.call_args.kwargs["messages"][1]["content"])
    assert sent["requestedSection"] == "services"
    assert [entity["id"] for entity in sent["entities"]] == ["service"]
    assert result.content.sections[0].items[0].title == "Consulting support"


@pytest.mark.asyncio
@patch("app.yullo.services.appearance_preview.collect_preview_facts", new_callable=AsyncMock, return_value=[])
async def test_section_build_without_provider_does_not_pretend_ai_generated(_facts):
    from app.yullo.schemas.appearance import default_presentation_config
    from app.yullo.schemas.appearance_preview import AppearancePreviewRequest
    from app.yullo.services.appearance_preview import generate_appearance_preview

    context = PreviewGenerationContext("Space", "business", None, None, False, [
        {"id": "service", "revision": 1, "type": "offering", "title": "Consulting"},
    ])
    with patch("app.yullo.services.appearance_preview.collect_preview_context", AsyncMock(return_value=context)), patch("app.yullo.services.appearance_preview.get_async_openai_clients", return_value=[]):
        result = await generate_appearance_preview(AsyncMock(), user_id=uuid.uuid4(), space_id=uuid.uuid4(), request=AppearancePreviewRequest(currentConfig=default_presentation_config(None), sectionType="services"))
    assert result.status == "unavailable"
    assert result.content is None


@pytest.mark.asyncio
async def test_collect_preview_context_not_found():
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc:
        await collect_preview_context(db, user_id=uuid.uuid4(), space_id=uuid.uuid4())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_fact_only_service_draft_generation_apply_and_revocation():
    from app.yullo.schemas.appearance import default_presentation_config
    from app.yullo.schemas.appearance_preview import AppearancePreviewRequest, AppearancePreviewContent
    from app.yullo.services.appearance_preview import generate_appearance_preview, apply_appearance_preview_section
    fact_id = str(uuid.uuid4())
    context = PreviewGenerationContext("Space", "business", None, None, False, [])
    facts = [{"id": fact_id, "subject": "Rocket", "label": "Use cases", "value": "Cargo transport", "note": None}]
    raw = {"schemaVersion": 1, "sections": [{"type": "services", "heading": "Services", "items": [{"key": "draft", "title": "Cargo transport", "source": "grounded", "sourceFactIds": [fact_id]}]}]}
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(raw)))]))
    db = AsyncMock()
    saved = SimpleNamespace(settings={})
    db.scalar.return_value = saved
    with patch("app.yullo.services.appearance_preview.collect_preview_context", AsyncMock(return_value=context)), patch("app.yullo.services.appearance_preview.collect_preview_facts", AsyncMock(return_value=facts)), patch("app.yullo.services.appearance_preview.get_async_openai_clients", return_value=[("test", client, "model")]), patch("app.yullo.services.appearance_preview.finalize_space_mutation", AsyncMock()) as finalize:
        response = await generate_appearance_preview(db, user_id=uuid.uuid4(), space_id=uuid.uuid4(), request=AppearancePreviewRequest(currentConfig=default_presentation_config(None), sectionType="services"))
        assert response.status == "ready"
        sent = json.loads(client.chat.completions.create.call_args.kwargs["messages"][1]["content"])
        assert sent["facts"] == facts
        assert sent["entities"] == []
        assert saved.settings == {}  # Generation does not publish.
        applied = await apply_appearance_preview_section(db, user_id=uuid.uuid4(), space_id=uuid.uuid4(), section=response.content.sections[0])
        assert applied.sections[0].items[0].title == "Cargo transport"
        finalize.assert_awaited_once()
    empty = AppearancePreviewContent(schemaVersion=1, sections=[])
    assert merge_applied_sections(empty, saved.settings, set(), {fact_id}).sections
    assert merge_applied_sections(empty, saved.settings, set(), set()).sections == []
    with patch("app.yullo.services.appearance_preview.collect_preview_context", AsyncMock(return_value=context)), patch("app.yullo.services.appearance_preview.collect_preview_facts", AsyncMock(return_value=[])):
        with pytest.raises(HTTPException) as error:
            await apply_appearance_preview_section(db, user_id=uuid.uuid4(), space_id=uuid.uuid4(), section=response.content.sections[0])
        assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_collect_preview_context_success():
    db = AsyncMock()

    mock_space = MagicMock()
    mock_space.display_name = "Test Space"
    mock_space.purpose = "business"
    mock_space.logo_url = None

    mock_yullo_space = MagicMock()
    mock_yullo_space.purpose = "business"

    mock_config = MagicMock()
    mock_config.settings = {"identity": {"category": "Software"}}

    mock_result = MagicMock()
    mock_result.first.return_value = (mock_space, mock_yullo_space, mock_config)
    db.execute.return_value = mock_result

    mock_entity = MagicMock()
    mock_entity.id = uuid.uuid4()
    mock_entity.entity_type = "offering"
    mock_entity.payload_json = {"title": "Test Service", "description": "Desc"}
    mock_entity.revision = 1

    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = [mock_entity]
    db.scalars.return_value = mock_scalars_result

    context = await collect_preview_context(db, user_id=uuid.uuid4(), space_id=uuid.uuid4())

    assert context.space_name == "Test Space"
    assert context.space_category == "Software"
    assert len(context.entities) == 1
    assert context.entities[0]["title"] == "Test Service"
    assert context.entities[0]["description"] == "Desc"
    assert context.entities[0]["type"] == "offering"
    assert context.entities[0]["revision"] == 1


def test_build_preview_fingerprint():
    context1 = PreviewGenerationContext(
        space_name="Space",
        space_purpose="business",
        space_category=None,
        space_description=None,
        has_logo=False,
        entities=[{"id": "123", "revision": 1, "type": "offering", "title": "A", "description": "B", "meta": None}],
    )
    context2 = PreviewGenerationContext(
        space_name="Space",
        space_purpose="business",
        space_category=None,
        space_description=None,
        has_logo=False,
        entities=[{"id": "123", "revision": 2, "type": "offering", "title": "A", "description": "B", "meta": None}],
    )

    fingerprint1 = build_preview_fingerprint(context1)
    fingerprint2 = build_preview_fingerprint(context2)

    assert fingerprint1 != fingerprint2


def test_applied_section_requires_current_public_entity():
    from app.yullo.services.appearance_preview import build_deterministic_landing_content

    live = build_deterministic_landing_content([
        {"id": "one", "revision": 1, "type": "offering", "kind": None, "title": "Original", "description": None, "meta": None},
    ])
    settings = {"appearance_applied_sections": {"services": {
        "type": "services", "heading": "How we help", "items": [{
            "key": "services:one", "title": "Approved wording", "source": "grounded", "sourceEntityId": "one"
        }]
    }}}

    applied = merge_applied_sections(live, settings, {"one"})
    removed = merge_applied_sections(live, settings, set())

    assert applied.sections[0].items[0].title == "Approved wording"
    assert removed.sections == []


@pytest.mark.asyncio
async def test_generate_preview_insufficient_context():
    from app.yullo.schemas.appearance import default_presentation_config
    from app.yullo.schemas.appearance_preview import AppearancePreviewRequest, PreviewStatus
    from app.yullo.services.appearance_preview import generate_appearance_preview

    db = AsyncMock()
    mock_space = MagicMock()
    mock_space.display_name = "Test Space"
    mock_space.purpose = "business"
    mock_space.logo_url = None

    mock_yullo_space = MagicMock()
    mock_yullo_space.purpose = "business"

    mock_config = MagicMock()
    mock_config.settings = {}

    mock_result = MagicMock()
    mock_result.first.return_value = (mock_space, mock_yullo_space, mock_config)
    db.execute.return_value = mock_result

    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = [] # no entities
    db.scalars.return_value = mock_scalars_result

    req = AppearancePreviewRequest(currentConfig=default_presentation_config(None), force=False)
    resp = await generate_appearance_preview(db, user_id=uuid.uuid4(), space_id=uuid.uuid4(), request=req)

    assert resp.status == PreviewStatus.insufficient_context
    assert resp.content is None


@pytest.mark.asyncio
async def test_forced_preview_rebuilds_from_confirmed_entities_without_provider():
    from app.yullo.schemas.appearance import default_presentation_config
    from app.yullo.schemas.appearance_preview import AppearancePreviewRequest, PreviewStatus
    from app.yullo.services.appearance_preview import generate_appearance_preview

    db = AsyncMock()
    space = MagicMock(display_name="Test Space", purpose="business", logo_url=None)
    yullo_space = MagicMock(purpose="business")
    yullo_config = MagicMock(settings={})
    row_result = MagicMock()
    row_result.first.return_value = (space, yullo_space, yullo_config)
    db.execute.return_value = row_result

    entity = MagicMock()
    entity.id = uuid.uuid4()
    entity.entity_type = "offering"
    entity.payload_json = {"title": "Brand strategy", "description": "Strategy for startups"}
    entity.revision = 1
    entity_rows = MagicMock()
    entity_rows.all.return_value = [entity]
    db.scalars.return_value = entity_rows

    response = await generate_appearance_preview(
        db,
        user_id=uuid.uuid4(),
        space_id=uuid.uuid4(),
        request=AppearancePreviewRequest(
            currentConfig=default_presentation_config(None),
            force=True,
        ),
    )

    assert response.status == PreviewStatus.ready
    assert response.content is not None
    assert response.content.sections[0].items[0].title == "Brand strategy"


@pytest.mark.asyncio
async def test_rebuild_space_layout_configures_grid_2col():
    from app.yullo.schemas.appearance import default_presentation_config
    from app.yullo.services.appearance_assistant import rebuild_space_layout

    db = AsyncMock()
    user_id = uuid.uuid4()
    space_id = uuid.uuid4()

    mock_appearance = MagicMock()
    mock_appearance.effective_config = default_presentation_config("business")

    mock_candidate = MagicMock()
    mock_candidate.config = default_presentation_config("business")
    mock_candidate.explanation = "Suggested clean business layout"

    mock_context = {
        "space": {"name": "SpaceX", "purpose": "business", "category": None, "description": None, "hasLogo": False},
        "reviewedEntityCounts": {"offering": 3},
        "eligibleAssets": [],
    }

    from app.yullo.schemas.appearance_preview import AppearancePreviewContent, AppearancePreviewSection, AppearancePreviewItem, PreviewContentSource

    mock_preview = MagicMock()
    mock_preview.content = AppearancePreviewContent(
        schemaVersion=1,
        sections=[
            AppearancePreviewSection(
                type="services",
                heading="SpaceX Services",
                items=[
                    AppearancePreviewItem(
                        key="item-1",
                        title="Falcon Heavy",
                        source=PreviewContentSource.grounded,
                        sourceEntityId="e1",
                    )
                ],
            )
        ],
    )
    mock_preview.grounded_entity_ids = ["e1"]

    with patch("app.yullo.services.persistence.appearance.get_appearance", AsyncMock(return_value=mock_appearance)), \
         patch("app.yullo.services.appearance_assistant.recommend_appearance", AsyncMock(return_value=mock_candidate)), \
         patch("app.yullo.services.appearance_assistant._appearance_context", AsyncMock(return_value=mock_context)), \
         patch("app.yullo.services.appearance_preview.generate_appearance_preview", AsyncMock(return_value=mock_preview)):
        resp = await rebuild_space_layout(db, user_id=user_id, space_id=space_id, force=True)

    assert resp.config is not None
    services_sec = next(s for s in resp.config.sections if s.type.value == "services")
    assert services_sec.variant == "grid_2col"
    assert resp.explanation == "Suggested clean business layout"
    assert resp.grounded_entity_ids == ["e1"]


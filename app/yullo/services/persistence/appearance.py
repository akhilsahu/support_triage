from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.yullo.models.appearance_asset import YulloAppearanceAsset
from app.yullo.schemas.appearance import (
    AppearanceSpaceSummary,
    AppearanceUpdateRequest,
    PresentationSource,
    SpacePresentationConfig,
    default_presentation_config,
)
from app.orchestra.ai.appearance_preview.asset_persistence import list_assets, list_source_extracted_assets
from app.yullo.services.persistence.common import finalize_space_mutation
from app.yullo.services.persistence.appearance_images import (
    applied_preview, load_appearance_images, resolve_preview_images,
)

from pydantic import ValidationError
from app.models.yullo_space_entity import YulloSpaceEntity
from app.models.knowledge_base import KnowledgeBase
from app.orchestra.ai.db_utils.get_facts import get_authoritative_facts
from app.yullo.config.appearance import get_appearance_runtime_config
from app.orchestra.ai.appearance_preview.generation import PreviewGenerationContext, generate_preview
from app.yullo.schemas.appearance_preview import (
    AppearancePreviewContent,
    AppearancePreviewRequest,
    AppearancePreviewResponse,
    PreviewContentSource,
    AppearancePreviewSection,
    AppearancePreviewItem,
    AppearanceEditorResponse,
    AppearanceRebuildLayoutResponse,
)
from app.yullo.services.entities.service import public_entity_predicates
from app.yullo.services.entities.payloads import public_entity_summary
from app.orchestra.ai.prompts.yullo.appearance import PREVIEW_SYSTEM_PROMPT as SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def _owned_space(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    lock: bool = False,
) -> tuple[Space, YulloSpace, YulloConfig | None]:
    statement = (
        select(Space, YulloSpace, YulloConfig)
        .join(YulloSpace, YulloSpace.space_id == Space.id)
        .outerjoin(YulloConfig, YulloConfig.space_id == Space.id)
        .where(
            Space.id == space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        )
    )
    if lock:
        # Match finalize_space_mutation's lock order before locking editor settings.
        await db.scalar(select(Space.id).where(
            Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo",
        ).with_for_update())
        statement = statement.with_for_update(of=YulloSpace).execution_options(populate_existing=True)
    row = (await db.execute(statement)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Yullo Space not found")
    return row[0], row[1], row[2]


def _parse_config(yullo_space: YulloSpace) -> SpacePresentationConfig:
    if not yullo_space.appearance_config:
        return default_presentation_config(yullo_space.purpose)
    try:
        return SpacePresentationConfig.model_validate(yullo_space.appearance_config)
    except Exception:
        logger.warning(
            "yullo.appearance.invalid_saved_config",
            extra={"space_id": str(yullo_space.space_id)},
        )
        return default_presentation_config(yullo_space.purpose)


def _space_summary(
    space: Space,
    yullo_space: YulloSpace,
    yullo_config: YulloConfig | None,
) -> AppearanceSpaceSummary:
    identity = ((yullo_config.settings or {}).get("identity") or {}) if yullo_config else {}
    return AppearanceSpaceSummary(
        id=space.id,
        displayName=space.display_name,
        slug=space.slug,
        status=space.status,
        purpose=yullo_space.purpose or space.purpose or "business",
        category=identity.get("category") or identity.get("subtype"),
        description=identity.get("description"),
        logoUrl=space.logo_url,
    )


async def get_appearance(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
) -> AppearanceEditorResponse:
    space, yullo_space, yullo_config = await _owned_space(
        db, user_id=user_id, space_id=space_id
    )
    config = _parse_config(yullo_space)
    assets = await list_assets(db, user_id=user_id, space_id=space_id)
    settings = (yullo_config.settings or {}) if yullo_config else {}
    draft = _parse_editor_draft(settings, space_id=space_id)
    if draft:
        # Persisted drafts remain candidates: recheck current disclosure policy on every read.
        context = await collect_preview_context(db, user_id=user_id, space_id=space_id)
        facts = await collect_preview_facts(db, space_id)
        entity_ids = {entity["id"] for entity in context.entities}
        fact_ids = {fact["id"] for fact in facts}
        for section in draft.preview_content.sections:
            section.items = [item for item in section.items if item_has_eligible_support(item, entity_ids, fact_ids)]
        draft.preview_content.sections = [section for section in draft.preview_content.sections if section.items]
        draft.preview_content = await resolve_preview_images(db, space_id=space_id, content=draft.preview_content)
        draft.grounded_entity_ids = sorted({
            item.source_entity_id for section in draft.preview_content.sections
            for item in section.items if item.source_entity_id
        })
        if draft.config.hero.asset_id and draft.config.hero.asset_id not in {asset.id for asset in assets}:
            draft.config.hero.asset_id = None
    return AppearanceEditorResponse(
        space=_space_summary(space, yullo_space, yullo_config),
        publishedConfig=config,
        effectiveConfig=draft.config if draft else config,
        recommendation=None,
        assets=assets,
        revision=yullo_space.context_version,
        editorDraft=draft,
        appearanceInitialized=bool(settings.get("appearance_initialized")) or draft is not None
        or config.presentation_source != PresentationSource.default,
    )


def _parse_editor_draft(settings: dict, *, space_id: UUID) -> AppearanceRebuildLayoutResponse | None:
    raw = settings.get("appearance_editor_draft")
    if not raw:
        return None
    try:
        return AppearanceRebuildLayoutResponse.model_validate(raw)
    except ValidationError:
        logger.warning("yullo.appearance.invalid_editor_draft", extra={"space_id": str(space_id)})
        return None


async def _locked_editor_settings(db: AsyncSession, *, space_id: UUID) -> YulloConfig:
    # Called only after the owner/product check and Space appearance lock.
    config = await db.scalar(select(YulloConfig).where(
        YulloConfig.space_id == space_id,
    ).with_for_update().execution_options(populate_existing=True))
    if not config:
        # Older Spaces may have an appearance without a product settings row yet.
        config = YulloConfig(space_id=space_id, settings={})
        db.add(config)
        await db.flush()
    return config


async def initialize_appearance(
    db: AsyncSession, *, user_id: UUID, space_id: UUID,
) -> AppearanceEditorResponse:
    # Serialize first visits across tabs; a second request reads the committed draft.
    _, yullo_space, _ = await _owned_space(db, user_id=user_id, space_id=space_id, lock=True)
    config = await _locked_editor_settings(db, space_id=space_id)
    settings = dict(config.settings or {})
    if (
        settings.get("appearance_initialized")
        or _parse_editor_draft(settings, space_id=space_id)
        or _parse_config(yullo_space).presentation_source != PresentationSource.default
    ):
        return await get_appearance(db, user_id=user_id, space_id=space_id)

    from app.orchestra.ai.appearance_preview.generate_appearance_suggestions import rebuild_space_layout

    draft = await rebuild_space_layout(db, user_id=user_id, space_id=space_id, force=False)
    context = await collect_preview_context(db, user_id=user_id, space_id=space_id)
    facts = await collect_preview_facts(db, space_id)
    draft.preview_content = merge_applied_sections(
        draft.preview_content, settings, {entity["id"] for entity in context.entities},
        {fact["id"] for fact in facts},
    )
    settings["appearance_editor_draft"] = draft.model_dump(mode="json", by_alias=True)
    settings["appearance_initialized"] = True
    config.settings = settings
    await db.flush()
    await finalize_space_mutation(
        db, user_id=user_id, space_id=space_id, public_content_changed=False,
        operation_key=f"appearance.initialize:{space_id}",
    )
    await db.flush()
    logger.info("yullo.appearance.initialized", extra={"space_id": str(space_id), "user_id": str(user_id)})
    return await get_appearance(db, user_id=user_id, space_id=space_id)


async def update_appearance(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    request: AppearanceUpdateRequest,
) -> AppearanceEditorResponse:
    _space, yullo_space, _config = await _owned_space(
        db, user_id=user_id, space_id=space_id, lock=True
    )
    if yullo_space.context_version != request.expected_revision:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "stale_revision",
                "message": "Appearance changed in another session.",
                "current_revision": yullo_space.context_version,
            },
        )

    config = request.config.model_copy(
        update={"presentation_source": PresentationSource.owner}
    )
    if config.hero.asset_id:
        asset_exists = await db.scalar(
            select(YulloAppearanceAsset.id).where(
                YulloAppearanceAsset.id == config.hero.asset_id,
                YulloAppearanceAsset.space_id == space_id,
                YulloAppearanceAsset.status == "active",
            )
        )
        if not asset_exists:
            extracted = await list_source_extracted_assets(db, space_id=space_id, public_only=True)
            if not any(ext.id == config.hero.asset_id for ext in extracted):
                raise HTTPException(status_code=422, detail="Selected appearance image is unavailable")
    yullo_space.appearance_config = config.model_dump(mode="json", by_alias=True)
    editor_config = await _locked_editor_settings(db, space_id=space_id)
    settings = dict(editor_config.settings or {})
    draft = _parse_editor_draft(settings, space_id=space_id)
    if draft and draft.preview_content.sections and not request.discard_editor_draft:
        draft.config = config
        settings["appearance_editor_draft"] = draft.model_dump(mode="json", by_alias=True)
    else:
        settings.pop("appearance_editor_draft", None)
    settings["appearance_initialized"] = True
    editor_config.settings = settings
    await db.flush()
    await finalize_space_mutation(
        db,
        user_id=user_id,
        space_id=space_id,
        public_content_changed=True,
        operation_key=f"appearance.update:{space_id}:{request.expected_revision}",
    )
    await db.flush()
    logger.info(
        "yullo.appearance.updated",
        extra={"space_id": str(space_id), "user_id": str(user_id)},
    )
    return await get_appearance(db, user_id=user_id, space_id=space_id)


async def collect_preview_facts(db: AsyncSession, space_id: UUID) -> list[dict]:
    """Reuse the canonical fact lifecycle policy for this Space's active knowledge."""
    kb_ids = (await db.scalars(select(KnowledgeBase.id).where(
        KnowledgeBase.space_id == space_id, KnowledgeBase.active.is_(True)
    ))).all()
    facts = []
    for kb_id in kb_ids:
        for fact in await get_authoritative_facts(db, space_id, kb_id, product='yullo'):
            facts.append({"id": str(fact.id), "subject": fact.subject, "label": fact.label,
                          "value": fact.value, "note": fact.note})
    return sorted(facts, key=lambda fact: fact["id"])


def item_has_eligible_support(item: AppearancePreviewItem, entity_ids: set[str], fact_ids: set[str]) -> bool:
    if item.source == PreviewContentSource.example:
        return True
    return (
        item.source.value == "grounded"
        and bool(item.source_entity_id or item.source_fact_ids)
        and (not item.source_entity_id or item.source_entity_id in entity_ids)
        and all(str(fact_id) in fact_ids for fact_id in item.source_fact_ids)
    )


async def collect_preview_context(
    db: AsyncSession, *, user_id: UUID, space_id: UUID
) -> PreviewGenerationContext:
    space, yullo_space, yullo_config = await _owned_space(
        db, user_id=user_id, space_id=space_id,
    )

    identity = ((yullo_config.settings or {}).get("identity") or {}) if yullo_config else {}

    entity_rows = (
        await db.scalars(
            select(YulloSpaceEntity)
            .where(
                *public_entity_predicates(space_id),
                YulloSpaceEntity.entity_type.in_(("offering", "portfolio_item", "location", "event", "action")),
            )
            .order_by(YulloSpaceEntity.sort_order.asc().nulls_last(), YulloSpaceEntity.id.asc())
        )
    ).all()

    projected_entities = [public_entity_summary(entity) for entity in entity_rows]

    return PreviewGenerationContext(
        space_name=space.display_name,
        space_purpose=yullo_space.purpose or space.purpose or "business",
        space_category=identity.get("category") or identity.get("subtype"),
        space_description=identity.get("description"),
        has_logo=bool(space.logo_url),
        entities=projected_entities,
    )


def build_deterministic_landing_content(entities: list[dict]) -> AppearancePreviewContent:
    """Group confirmed public entities without an LLM for the published page."""
    section_items: dict[str, list[dict]] = {
        "services": [],
        "products": [],
        "portfolio": [],
        "location": [],
        "featured": [],
    }
    for entity in entities:
        entity_type = entity["type"]
        section_type = None
        if entity_type == "offering":
            section_type = "products" if entity.get("kind") == "product" else "services"
        elif entity_type == "portfolio_item":
            section_type = "portfolio"
        elif entity_type == "location":
            section_type = "location"
        elif entity_type in ("event", "action"):
            section_type = "featured"
        if not section_type or len(section_items[section_type]) >= 4:
            continue
        section_items[section_type].append(
            {
                "key": f"{section_type}:{entity['id']}",
                "title": entity["title"][:120],
                "description": entity.get("description")[:240] if entity.get("description") else None,
                "meta": entity.get("meta")[:100] if entity.get("meta") else None,
                "source": "grounded",
                "sourceEntityId": entity["id"],
            }
        )

    headings = {
        "services": "Services",
        "products": "Products",
        "portfolio": "Selected work",
        "location": "Location",
        "featured": "Featured",
    }
    return AppearancePreviewContent.model_validate(
        {
            "schemaVersion": 1,
            "sections": [
                {"type": section_type, "heading": headings[section_type], "items": items}
                for section_type, items in section_items.items()
                if items
            ],
        }
    )


def merge_applied_sections(
    content: AppearancePreviewContent,
    settings: dict | None,
    eligible_entity_ids: set[str],
    eligible_fact_ids: set[str] | None = None,
) -> AppearancePreviewContent:
    """Overlay owner-applied wording while its supporting entities stay public."""
    raw = (settings or {}).get("appearance_applied_sections") or {}
    by_type = {section.type.value: section for section in content.sections}
    for section_type, value in raw.items():
        try:
            section = AppearancePreviewSection.model_validate(value)
        except ValidationError:
            continue
        if section.type.value != section_type:
            continue
        section.items = [
            item for item in section.items
            if item_has_eligible_support(item, eligible_entity_ids, eligible_fact_ids or set())
        ]
        if section.items:
            by_type[section_type] = section
        else:
            by_type.pop(section_type, None)
    ordered_types = [section.type.value for section in content.sections]
    ordered_types.extend(key for key in raw if key not in ordered_types)
    return AppearancePreviewContent(
        schemaVersion=1,
        sections=[by_type[key] for key in ordered_types if key in by_type],
    )


async def apply_appearance_preview_section(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, section: AppearancePreviewSection
) -> AppearancePreviewContent:
    await _owned_space(db, user_id=user_id, space_id=space_id, lock=True)
    context = await collect_preview_context(db, user_id=user_id, space_id=space_id)
    facts = await collect_preview_facts(db, space_id)
    fact_ids = {fact["id"] for fact in facts}
    canonical = build_deterministic_landing_content(context.entities)
    canonical_section = next((item for item in canonical.sections if item.type == section.type), None)
    eligible = {
        item.source_entity_id for item in canonical_section.items
        if item.source_entity_id
    } if canonical_section else set()
    if (
        not section.items
        or any(not item_has_eligible_support(item, eligible, fact_ids) for item in section.items)
    ):
        raise HTTPException(status_code=422, detail="This draft uses details that are no longer public.")

    images = await load_appearance_images(db, space_id=space_id, content=AppearancePreviewContent(sections=[section]))
    images.resolve(AppearancePreviewContent(sections=[section]), public=True, strict=True)

    yullo_config = await db.scalar(
        select(YulloConfig)
        .join(Space, Space.id == YulloConfig.space_id)
        .where(
            YulloConfig.space_id == space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        )
        .with_for_update(of=YulloConfig)
        .execution_options(populate_existing=True)
    )
    if not yullo_config:
        raise HTTPException(status_code=404, detail="Yullo Space configuration not found")
    settings = dict(yullo_config.settings or {})
    applied = dict(settings.get("appearance_applied_sections") or {})
    applied[section.type.value] = section.model_dump(mode="json", by_alias=True)
    settings["appearance_applied_sections"] = applied
    draft = _parse_editor_draft(settings, space_id=space_id)
    if draft:
        draft.preview_content.sections = [item for item in draft.preview_content.sections if item.type != section.type]
        # Retain a pending layout even after its last content section is applied.
        if draft.preview_content.sections or draft.config.presentation_source != PresentationSource.owner:
            settings["appearance_editor_draft"] = draft.model_dump(mode="json", by_alias=True)
        else:
            settings.pop("appearance_editor_draft", None)
    yullo_config.settings = settings
    await finalize_space_mutation(
        db,
        user_id=user_id,
        space_id=space_id,
        public_content_changed=True,
        operation_key=f"appearance.preview.apply:{space_id}:{section.type.value}",
    )
    await db.flush()
    live = canonical
    return images.resolve(merge_applied_sections(
        live, settings, {entity["id"] for entity in context.entities}, fact_ids
    ))


async def get_live_appearance_preview(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, public: bool = False,
) -> AppearancePreviewContent:
    context = await collect_preview_context(db, user_id=user_id, space_id=space_id)
    config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == space_id))
    live = build_deterministic_landing_content(context.entities)
    facts = await collect_preview_facts(db, space_id)
    content = merge_applied_sections(
        live,
        config.settings if config else {},
        {entity["id"] for entity in context.entities},
        {fact["id"] for fact in facts},
    )
    return await resolve_preview_images(db, space_id=space_id, content=content, public=public)


async def generate_appearance_preview(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, request: AppearancePreviewRequest,
) -> AppearancePreviewResponse:
    """Supply owner-authorized evidence and product policy to shared AI generation."""
    from app.yullo.schemas.appearance_preview import PreviewStatus

    config = get_appearance_runtime_config()
    context = await collect_preview_context(db, user_id=user_id, space_id=space_id)
    facts = await collect_preview_facts(db, space_id) if request.section_type else []
    result = await generate_preview(
        context, space_id=space_id, request=request, config=config, facts=facts,
        policy=dict(
            system_prompt=SYSTEM_PROMPT, content_model=AppearancePreviewContent,
            response_model=AppearancePreviewResponse, status=PreviewStatus,
            build_content=build_deterministic_landing_content,
            item_supported=item_has_eligible_support,
        ),
    )
    if result.content:
        images = await load_appearance_images(db, space_id=space_id, content=result.content, suggest=True)
        settings = await db.scalar(select(YulloConfig.settings).where(YulloConfig.space_id == space_id))
        previous = applied_preview(settings or {})
        if request.current_content:
            by_type = {section.type: section for section in previous.sections}
            by_type.update({section.type: section for section in request.current_content.sections})
            previous = AppearancePreviewContent(sections=list(by_type.values()))
        result.content = images.suggest(result.content, previous)
        logger.info('yullo.appearance.images_suggested', extra={
            'space_id': str(space_id),
            'image_count': sum(bool(item.image_url) for section in result.content.sections for item in section.items),
        })
    return result

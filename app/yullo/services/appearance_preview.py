import hashlib
import json
import logging
import time
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm_provider import get_async_openai_clients
from app.models.space import Space
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.models.knowledge_base import KnowledgeBase
from app.yullo.services.knowledge.retrieval import get_authoritative_facts
from app.yullo.config.appearance import get_appearance_runtime_config
from app.yullo.schemas.appearance_preview import (
    AppearancePreviewContent,
    AppearancePreviewRequest,
    AppearancePreviewResponse,
    PreviewStatus,
    PreviewContentSource,
    AppearancePreviewSection,
    AppearancePreviewItem,
)
from app.yullo.services.persistence.common import finalize_space_mutation
from app.yullo.services.inference.generative_ui import (
    public_entity_predicates,
    public_entity_summary,
)

logger = logging.getLogger(__name__)


async def collect_preview_facts(db: AsyncSession, space_id: UUID) -> list[dict]:
    """Reuse the canonical fact lifecycle policy for this Space's active knowledge."""
    kb_ids = (await db.scalars(select(KnowledgeBase.id).where(
        KnowledgeBase.space_id == space_id, KnowledgeBase.active.is_(True)
    ))).all()
    facts = []
    for kb_id in kb_ids:
        for fact in await get_authoritative_facts(db, space_id, kb_id):
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


@dataclass
class PreviewGenerationContext:
    space_name: str
    space_purpose: str
    space_category: str | None
    space_description: str | None
    has_logo: bool
    entities: list[dict]


async def collect_preview_context(
    db: AsyncSession, *, user_id: UUID, space_id: UUID
) -> PreviewGenerationContext:
    row = (
        await db.execute(
            select(Space, YulloSpace, YulloConfig)
            .join(YulloSpace, YulloSpace.space_id == Space.id)
            .outerjoin(YulloConfig, YulloConfig.space_id == Space.id)
            .where(
                Space.id == space_id,
                Space.owner_user_id == user_id,
                Space.product == "yullo",
            )
        )
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Yullo Space not found")

    space, yullo_space, yullo_config = row
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

    yullo_config = await db.scalar(
        select(YulloConfig)
        .join(Space, Space.id == YulloConfig.space_id)
        .where(
            YulloConfig.space_id == space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        )
        .with_for_update(of=YulloConfig)
    )
    if not yullo_config:
        raise HTTPException(status_code=404, detail="Yullo Space configuration not found")
    settings = dict(yullo_config.settings or {})
    applied = dict(settings.get("appearance_applied_sections") or {})
    applied[section.type.value] = section.model_dump(mode="json", by_alias=True)
    settings["appearance_applied_sections"] = applied
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
    return merge_applied_sections(
        live, settings, {entity["id"] for entity in context.entities}, fact_ids
    )


async def get_live_appearance_preview(
    db: AsyncSession, *, user_id: UUID, space_id: UUID
) -> AppearancePreviewContent:
    context = await collect_preview_context(db, user_id=user_id, space_id=space_id)
    config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == space_id))
    live = build_deterministic_landing_content(context.entities)
    facts = await collect_preview_facts(db, space_id)
    return merge_applied_sections(
        live,
        config.settings if config else {},
        {entity["id"] for entity in context.entities},
        {fact["id"] for fact in facts},
    )


def build_deterministic_preview_response(
    entities: list[dict], *, fingerprint: str
) -> AppearancePreviewResponse | None:
    """Build a safe preview when the optional LLM provider cannot respond."""
    content = build_deterministic_landing_content(entities)
    if not content.sections:
        return None
    grounded_ids = sorted(
        {
            item.source_entity_id
            for section in content.sections
            for item in section.items
            if item.source_entity_id
        }
    )
    return AppearancePreviewResponse(
        status=PreviewStatus.ready,
        content=content,
        explanation=f"Built from {len(grounded_ids)} confirmed details",
        groundedEntityIds=grounded_ids,
        inputFingerprint=fingerprint,
    )


def build_preview_fingerprint(context: PreviewGenerationContext, *, prompt_version: str = "v1") -> str:
    fingerprint_data = {
        "identity": {
            "name": context.space_name,
            "purpose": context.space_purpose,
            "category": context.space_category,
            "description": context.space_description,
            "has_logo": context.has_logo,
        },
        "entities": [{"id": e["id"], "rev": e["revision"]} for e in context.entities],
        "prompt_version": prompt_version,
    }
    dumped = json.dumps(fingerprint_data, sort_keys=True)
    return hashlib.sha256(dumped.encode("utf-8")).hexdigest()


from app.yullo.prompts.appearance import PREVIEW_SYSTEM_PROMPT as SYSTEM_PROMPT


async def generate_appearance_preview(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    request: AppearancePreviewRequest,
) -> AppearancePreviewResponse:
    config = get_appearance_runtime_config()

    # 1. Collect Context
    context = await collect_preview_context(db, user_id=user_id, space_id=space_id)
    fingerprint = build_preview_fingerprint(context, prompt_version=config.preview_prompt_version)
    facts = await collect_preview_facts(db, space_id) if request.section_type else []
    if facts:
        fingerprint = hashlib.sha256((fingerprint + json.dumps(facts, sort_keys=True)).encode()).hexdigest()
    if request.section_type:
        supported = build_deterministic_landing_content(context.entities)
        section_ids = {
            item.source_entity_id
            for section in supported.sections if section.type == request.section_type
            for item in section.items
        }
        context.entities = [entity for entity in context.entities if entity["id"] in section_ids]

    if not config.preview_generation_enabled:
        return AppearancePreviewResponse(
            status=PreviewStatus.unavailable,
            explanation="AI section building is currently unavailable. Your preview is unchanged.",
            inputFingerprint=fingerprint,
        )

    section_label = request.section_type.value.replace('_', ' ') if request.section_type else "this section"
    missing_details = f"Add or confirm details for {section_label} in Knowledge, then build again."
    if not (context.entities or facts):
        return AppearancePreviewResponse(
            status=PreviewStatus.insufficient_context,
            content=None,
            explanation=missing_details,
            groundedEntityIds=[],
            inputFingerprint=fingerprint,
        )

    # Prepare prompt DTOs
    prompt_payload = {
        "space": {
            "name": context.space_name,
            "purpose": context.space_purpose,
            "category": context.space_category,
            "description": context.space_description,
            "hasLogo": context.has_logo,
        },
        "entities": context.entities,
        "facts": facts,
    }
    if request.section_type:
        prompt_payload["requestedSection"] = request.section_type.value
        prompt_payload["instruction"] = (
            "Decide which supplied details to display in this section. Write its heading "
            "and concise item titles and descriptions. Return only the requested section. "
            "Use relevant confirmed facts even when no structured offering exists. "
            "Every item must have source='grounded'. For entity-backed items preserve sourceEntityId; "
            "for fact-backed items use sourceFactIds listing the supplied fact UUIDs and leave sourceEntityId null. "
            "Do not infer current commercial availability from a future plan, specification or ambition. "
            "If the facts do not support the requested section, return an empty sections array."
        )
    # Enforce character limit
    prompt_json = json.dumps(prompt_payload, separators=(",", ":"))
    while len(prompt_json) > config.preview_max_context_characters and (prompt_payload["entities"] or prompt_payload["facts"]):
        # Keep both evidence kinds represented where the configured budget permits.
        evidence = max((prompt_payload["entities"], prompt_payload["facts"]), key=lambda values: len(json.dumps(values)))
        evidence.pop()
        prompt_json = json.dumps(prompt_payload, separators=(",", ":"))
    allowed_ids = {entity["id"] for entity in prompt_payload["entities"]}
    allowed_fact_ids = {fact["id"] for fact in prompt_payload["facts"]}
    if not (allowed_ids or allowed_fact_ids):
        return AppearancePreviewResponse(
            status=PreviewStatus.unavailable,
            content=None,
            explanation="Could not prepare this section from the available details. Your preview is unchanged.",
            groundedEntityIds=[],
            inputFingerprint=fingerprint,
        )

    # An owner-requested rebuild must be immediate and dependable. Recompose the
    # preview from the latest confirmed public entities without relying on an LLM.
    if request.force and not request.section_type:
        forced_preview = build_deterministic_preview_response(
            prompt_payload["entities"], fingerprint=fingerprint
        )
        if forced_preview:
            return forced_preview

    clients = get_async_openai_clients(
        override_model=config.preview_model,
        timeout=config.preview_timeout_seconds,
        max_retries=0,
    )

    if not clients:
        fallback = build_deterministic_preview_response(
            prompt_payload["entities"], fingerprint=fingerprint
        )
        if fallback and not request.section_type:
            return fallback
        return AppearancePreviewResponse(
            status=PreviewStatus.unavailable,
            content=None,
            explanation="Could not rebuild the preview. Your current preview is unchanged.",
            groundedEntityIds=[],
            inputFingerprint=fingerprint,
        )

    start_time = time.monotonic()

    for provider_name, client, model in clients:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT + "\nOutput JSON schema:\n" + json.dumps(AppearancePreviewContent.model_json_schema(by_alias=True))},
                    {"role": "user", "content": prompt_json},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=1500,
            )

            content_str = response.choices[0].message.content or "{}"
            # Validate JSON matching schema
            content = AppearancePreviewContent.model_validate_json(content_str)

            # Post validation
            used_ids = set()
            used_fact_ids: set[UUID] = set()
            validated_sections = []

            for section in content.sections:
                if request.section_type and section.type != request.section_type:
                    raise ValueError("Provider returned an unrequested section")
                validated_items = []
                for idx, item in enumerate(section.items[:config.preview_max_items_per_section]):
                    if not item_has_eligible_support(item, allowed_ids, allowed_fact_ids):
                        raise ValueError("Provider returned unsupported source references")
                    if item.source_entity_id:
                        used_ids.add(item.source_entity_id)
                    used_fact_ids.update(item.source_fact_ids)
                    # Assign deterministic keys
                    reference = item.source_entity_id or ':'.join(str(value) for value in item.source_fact_ids)
                    item.key = f"{section.type.value}:{reference}:{idx}"
                    validated_items.append(item)

                if validated_items:
                    section.items = validated_items
                    validated_sections.append(section)

            content.sections = validated_sections

            if not validated_sections:
                return AppearancePreviewResponse(
                    status=PreviewStatus.insufficient_context,
                    content=None,
                    explanation=f"The confirmed details do not describe {section_label} clearly enough. {missing_details}",
                    groundedEntityIds=[],
                    inputFingerprint=fingerprint,
                )

            latency = time.monotonic() - start_time
            logger.info(
                "yullo.appearance.preview_generated",
                extra={
                    "space_id": str(space_id),
                    "provider": provider_name,
                    "model": model,
                    "status": "success",
                    "latency_ms": int(latency * 1000),
                    "grounded_count": len(used_ids) + len(used_fact_ids),
                }
            )

            return AppearancePreviewResponse(
                status=PreviewStatus.ready,
                content=content,
                explanation="Draft built from confirmed Space details. Review it before applying.",
                groundedEntityIds=list(used_ids),
                groundedFactIds=sorted(used_fact_ids, key=str),
                inputFingerprint=fingerprint,
            )

        except ValidationError:
            # We treat validation errors as provider unavailability (bad response)
            logger.warning(
                "yullo.appearance.preview_validation_failed",
                extra={"space_id": str(space_id), "provider": provider_name}
            )
        except Exception as exc:
            logger.warning(
                "yullo.appearance.preview_provider_failed",
                extra={"space_id": str(space_id), "provider": provider_name, "error_type": type(exc).__name__}
            )

    # Provider exhaustion
    latency = time.monotonic() - start_time
    logger.info(
        "yullo.appearance.preview_generated",
        extra={
            "space_id": str(space_id),
            "status": "exhausted",
            "latency_ms": int(latency * 1000),
        }
    )

    fallback = build_deterministic_preview_response(
        prompt_payload["entities"], fingerprint=fingerprint
    )
    if fallback and not request.section_type:
        return fallback
    return AppearancePreviewResponse(
        status=PreviewStatus.unavailable,
        content=None,
        explanation="Could not rebuild the preview. Your current preview is unchanged.",
        groundedEntityIds=[],
        inputFingerprint=fingerprint,
    )

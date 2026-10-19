from __future__ import annotations

import json
import logging
from collections import Counter
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm_provider import get_async_openai_clients
from app.models.space import Space
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.yullo.config.appearance import get_appearance_runtime_config
from app.yullo.models.appearance_asset import YulloAppearanceAsset
from app.yullo.schemas.appearance import (
    AppearanceCandidateResponse,
    AppearanceCommandRequest,
    PresentationSource,
    SpacePresentationConfig,
)

logger = logging.getLogger(__name__)

from app.yullo.prompts.appearance import ASSISTANT_SYSTEM_PROMPT as SYSTEM_PROMPT


async def _appearance_context(
    db: AsyncSession, *, user_id: UUID, space_id: UUID
) -> dict:
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
    entity_types = (
        await db.scalars(
            select(YulloSpaceEntity.entity_type).where(
                YulloSpaceEntity.space_id == space_id,
                YulloSpaceEntity.is_active.is_(True),
                YulloSpaceEntity.review_status.in_(("owner_confirmed", "source_authoritative")),
            )
        )
    ).all()
    assets = (
        await db.scalars(
            select(YulloAppearanceAsset).where(
                YulloAppearanceAsset.space_id == space_id,
                YulloAppearanceAsset.status == "active",
            )
        )
    ).all()
    return {
        "space": {
            "name": space.display_name,
            "purpose": yullo_space.purpose or space.purpose or "business",
            "category": identity.get("category") or identity.get("subtype"),
            "description": identity.get("description"),
            "hasLogo": bool(space.logo_url),
        },
        "reviewedEntityCounts": dict(Counter(entity_types)),
        "eligibleAssets": [
            {
                "id": str(asset.id),
                "width": asset.width,
                "height": asset.height,
                "hasAltText": bool(asset.alt_text),
            }
            for asset in assets
        ],
    }


def _allowed_values() -> dict:
    return {
        "themePreset": ["clean", "professional", "technical", "warm", "editorial", "visual", "bold", "minimal", "personal", "community", "trustworthy"],
        "landingEmphasis": ["balanced", "visual", "services", "local", "minimal"],
        "accent": ["yullo", "blue", "cyan", "violet", "coral", "forest", "neutral"],
        "backgroundTreatment": ["soft", "light", "dark", "image"],
        "heroLayout": ["centered", "image_left", "image_right", "image_background"],
        "visualDensity": ["minimal", "balanced", "expressive"],
        "networkIntensity": ["none", "very_low", "low"],
        "contentLayout": ["left", "center", "right", "stretch"],
        "sectionTypes": ["identity", "services", "portfolio", "products", "location", "featured", "prompt_starters"],
        "sectionVariants": ["grid_2col", "grid_3col", "list"],
    }



async def _complete(payload: dict) -> AppearanceCandidateResponse:
    runtime = get_appearance_runtime_config()
    if not runtime.assistant_enabled:
        raise HTTPException(status_code=503, detail="Appearance assistant is unavailable")
    clients = get_async_openai_clients(
        override_model=runtime.model,
        timeout=runtime.timeout_seconds,
        max_retries=0,
    )
    if not clients:
        raise HTTPException(status_code=503, detail="Appearance assistant is unavailable")

    last_error: Exception | None = None
    for provider_name, client, model in clients:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, separators=(",", ":"))},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=1400,
            )
            content = response.choices[0].message.content or "{}"
            candidate = AppearanceCandidateResponse.model_validate_json(content)
            candidate = candidate.model_copy(update={"config": candidate.config.model_copy(
                update={"presentation_source": PresentationSource.aura}
            )})
            return candidate
        except Exception as exc:
            last_error = exc
            logger.warning(
                "yullo.appearance.assistant_provider_failed",
                extra={"provider": provider_name, "error_type": type(exc).__name__},
            )
    raise HTTPException(status_code=503, detail="Appearance assistant could not create a suggestion") from last_error


async def recommend_appearance(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, current: SpacePresentationConfig
) -> AppearanceCandidateResponse:
    context = await _appearance_context(db, user_id=user_id, space_id=space_id)
    return await _complete(
        {
            "mode": "recommendation",
            "context": context,
            "currentConfig": current.model_dump(mode="json", by_alias=True),
            "allowedValues": _allowed_values(),
        }
    )


async def apply_appearance_command(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    request: AppearanceCommandRequest,
) -> AppearanceCandidateResponse:
    context = await _appearance_context(db, user_id=user_id, space_id=space_id)
    return await _complete(
        {
            "mode": "command",
            "instruction": request.instruction,
            "context": context,
            "currentConfig": request.current_config.model_dump(mode="json", by_alias=True),
            "allowedValues": _allowed_values(),
        }
    )


async def rebuild_space_layout(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    force: bool = False,
):
    from app.yullo.services.persistence.appearance import get_appearance
    from app.yullo.services.appearance_preview import (
        generate_appearance_preview,
        get_live_appearance_preview,
    )
    from app.yullo.schemas.appearance_preview import (
        AppearancePreviewRequest,
        AppearanceRebuildLayoutResponse,
    )

    appearance = await get_appearance(db, user_id=user_id, space_id=space_id)

    candidate_config: SpacePresentationConfig
    explanation = ""
    try:
        candidate = await recommend_appearance(
            db, user_id=user_id, space_id=space_id, current=appearance.effective_config
        )
        candidate_config = candidate.config
        explanation = candidate.explanation
    except Exception as exc:
        logger.warning(
            "yullo.appearance.rebuild_layout_recommend_fallback",
            extra={"space_id": str(space_id), "error_type": type(exc).__name__, "error": str(exc)},
        )
        candidate_config = appearance.effective_config.model_copy()

    # Intelligently ensure grid box layouts (2x2, 2x3 cards) for services and products
    context = await _appearance_context(db, user_id=user_id, space_id=space_id)
    updated_sections = []
    for s in candidate_config.sections:
        if s.type.value in ("services", "products") and not s.variant:
            s = s.model_copy(update={"variant": "grid_2col"})
        elif s.type.value == "portfolio" and not s.variant:
            s = s.model_copy(update={"variant": "grid_3col"})
        updated_sections.append(s)

    candidate_config = candidate_config.model_copy(update={
        "sections": updated_sections,
        "presentation_source": PresentationSource.aura,
    })

    # Generate or extract landing preview content
    preview_resp = None
    try:
        preview_resp = await generate_appearance_preview(
            db,
            user_id=user_id,
            space_id=space_id,
            request=AppearancePreviewRequest(
                current_config=candidate_config,
                force=force,
            ),
        )
    except Exception as exc:
        logger.warning(
            "yullo.appearance.rebuild_layout_preview_failed",
            extra={"space_id": str(space_id), "error": str(exc)},
        )

    if preview_resp and preview_resp.content and preview_resp.content.sections:
        preview_content = preview_resp.content
        grounded_ids = preview_resp.grounded_entity_ids
    else:
        preview_content = await get_live_appearance_preview(db, user_id=user_id, space_id=space_id)
        grounded_ids = [
            item.source_entity_id
            for s in preview_content.sections
            for item in s.items
            if item.source_entity_id
        ]

    if not explanation:
        explanation = f"Generated {candidate_config.theme_preset.capitalize()} layout with {len(preview_content.sections)} content sections from Space knowledge."

    return AppearanceRebuildLayoutResponse(
        config=candidate_config,
        previewContent=preview_content,
        explanation=explanation,
        groundedEntityIds=grounded_ids,
    )


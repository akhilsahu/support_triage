from __future__ import annotations

import json
import logging
import asyncio
import base64
import io
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
from PIL import Image, ImageOps
from app.orchestra.ai.ingestion.storage import materialize
from app.yullo.schemas.forms.identity import validate_logo_url
from app.yullo.schemas.appearance import (
    AppearanceCandidateResponse,
    AppearanceCommandRequest,
    PresentationSource,
    SpacePresentationConfig,
)

logger = logging.getLogger(__name__)

from app.orchestra.ai.prompts.yullo.appearance import ASSISTANT_SYSTEM_PROMPT as SYSTEM_PROMPT


async def _appearance_context(
    db: AsyncSession, *, user_id: UUID, space_id: UUID,
    include_image: bool = False, hero_asset_id: UUID | None = None,
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
    reference_image = None
    if include_image and get_appearance_runtime_config().assistant_image_enabled:
        selected_asset = next((asset for asset in assets if asset.id == hero_asset_id), None)
        reference_image = await _reference_image(space.logo_url, selected_asset)
    return {
        "referenceImage": reference_image,
        "space": {
            "name": space.display_name,
            "purpose": yullo_space.purpose or space.purpose or "business",
            "category": identity.get("category") or identity.get("subtype"),
            "description": identity.get("description") or space.description,
            "hasLogo": bool(space.logo_url),
            "type": yullo_space.space_type,
            "isSubspace": yullo_space.parent_space_id is not None,
            "hasReferenceImage": bool(reference_image),
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


async def _reference_image(cover: str | None, asset: YulloAppearanceAsset | None) -> str | None:
    """Bounded thumbnail of the authorized cover/asset; never fetch arbitrary URLs."""
    runtime = get_appearance_runtime_config()

    def thumbnail(body: bytes) -> str:
        if len(body) > runtime.max_asset_bytes:
            raise ValueError("Image exceeds appearance limit")
        with Image.open(io.BytesIO(body)) as image:
            if image.width * image.height > runtime.max_asset_pixels:
                raise ValueError("Image exceeds pixel limit")
            image = ImageOps.exif_transpose(image)
            image.thumbnail((768, 768))
            rgba = image.convert("RGBA")
            flattened = Image.new("RGB", rgba.size, "white")
            flattened.paste(rgba, mask=rgba.getchannel("A"))
            output = io.BytesIO()
            flattened.save(output, "JPEG", quality=80)
        return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")

    try:
        if asset:
            async with materialize(asset.storage_key) as path:
                if path.stat().st_size > runtime.max_asset_bytes:
                    raise ValueError("Image exceeds appearance limit")
                return await asyncio.to_thread(lambda: thumbnail(path.read_bytes()))
        if cover and cover.startswith("data:"):
            validate_logo_url(cover)
            return await asyncio.to_thread(thumbnail, base64.b64decode(cover.partition(",")[2], validate=True))
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        logger.info("yullo.appearance.reference_image_unavailable", extra={"error_type": type(exc).__name__})
    return None


def _allowed_values() -> dict:
    return {
        "themePreset": ["clean", "professional", "technical", "warm", "editorial", "visual", "bold", "minimal", "personal", "community", "trustworthy"],
        "landingEmphasis": ["balanced", "visual", "services", "local", "minimal"],
        "accent": ["yullo", "blue", "cyan", "violet", "coral", "forest", "neutral"],
        "accentColor": "Optional #RRGGBB from reference artwork; null uses the named accent",
        "backgroundTreatment": ["soft", "light", "dark", "image"],
        "heroLayout": ["centered", "image_left", "image_right", "image_background"],
        "heroVisible": [True, False],
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
    context = dict(payload.get("context", {}))
    reference_image = context.pop("referenceImage", None)
    payload = {**payload, "context": context}
    message = json.dumps(payload, separators=(",", ":"))
    user_content = [
        {"type": "text", "text": message},
        {"type": "image_url", "image_url": {"url": reference_image, "detail": "low"}},
    ] if reference_image else message
    for provider_name, client, model in clients:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=1400,
            )
            content = response.choices[0].message.content or "{}"
            candidate = AppearanceCandidateResponse.model_validate_json(content)
            if payload.get("mode") == "rebuild":
                before = dict(payload["currentConfig"])
                before.pop("presentationSource", None)
                after = candidate.config.model_dump(mode="json", by_alias=True, exclude={"presentation_source"})
                for config in (before, after):
                    if config.get("accentColor"):
                        config["accentColor"] = config["accentColor"].lower()
                if before == after:
                    raise ValueError("Rebuild did not propose an appearance change")
            eligible_ids = {asset["id"] for asset in context.get("eligibleAssets", [])}
            if candidate.config.hero.asset_id and str(candidate.config.hero.asset_id) not in eligible_ids:
                raise ValueError("Suggested hero asset is not eligible for this Space")
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
    db: AsyncSession, *, user_id: UUID, space_id: UUID, current: SpacePresentationConfig, mode: str = "recommendation"
) -> AppearanceCandidateResponse:
    context = await _appearance_context(db, user_id=user_id, space_id=space_id, include_image=True, hero_asset_id=current.hero.asset_id)
    return await _complete(
        {
            "mode": mode,
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
    context = await _appearance_context(db, user_id=user_id, space_id=space_id, include_image=True, hero_asset_id=request.current_config.hero.asset_id)
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
    current_config: SpacePresentationConfig | None = None,
):
    from app.yullo.services.persistence.appearance import (
        get_appearance, generate_appearance_preview,
        get_live_appearance_preview,
    )
    from app.yullo.schemas.appearance_preview import (
        AppearancePreviewRequest,
        AppearanceRebuildLayoutResponse,
    )

    appearance = await get_appearance(db, user_id=user_id, space_id=space_id)
    current = current_config or appearance.effective_config

    candidate_config: SpacePresentationConfig
    explanation = ""
    try:
        candidate = await recommend_appearance(
            db, user_id=user_id, space_id=space_id, current=current, mode="rebuild" if force else "initial"
        )
        candidate_config = candidate.config
        explanation = candidate.explanation
    except Exception as exc:
        logger.warning(
            "yullo.appearance.rebuild_layout_recommend_fallback",
            extra={"space_id": str(space_id), "error_type": type(exc).__name__},
        )
        if force:
            raise HTTPException(503, "Could not rebuild the appearance. Your current layout is unchanged.") from exc
        candidate_config = current.model_copy()

    # Intelligently ensure grid box layouts (2x2, 2x3 cards) for services and products
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


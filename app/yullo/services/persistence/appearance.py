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
    AppearanceResponse,
    AppearanceSpaceSummary,
    AppearanceUpdateRequest,
    PresentationSource,
    SpacePresentationConfig,
    default_presentation_config,
)
from app.yullo.services.appearance_assets import list_assets
from app.yullo.services.persistence.common import finalize_space_mutation

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
        statement = statement.with_for_update(of=YulloSpace)
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
) -> AppearanceResponse:
    space, yullo_space, yullo_config = await _owned_space(
        db, user_id=user_id, space_id=space_id
    )
    config = _parse_config(yullo_space)
    return AppearanceResponse(
        space=_space_summary(space, yullo_space, yullo_config),
        publishedConfig=config,
        effectiveConfig=config,
        recommendation=None,
        assets=await list_assets(db, user_id=user_id, space_id=space_id),
        revision=yullo_space.context_version,
    )


async def update_appearance(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    request: AppearanceUpdateRequest,
) -> AppearanceResponse:
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
            raise HTTPException(status_code=422, detail="Selected appearance image is unavailable")
    yullo_space.appearance_config = config.model_dump(mode="json", by_alias=True)
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

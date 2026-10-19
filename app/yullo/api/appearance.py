from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.models.user import User
from app.orchestra.ai.ingestion.storage import materialize as materialize_blob
from app.yullo.schemas.appearance import (
    AppearanceAssetResponse,
    AppearanceAssetUpdateRequest,
    AppearanceCandidateResponse,
    AppearanceCommandRequest,
    AppearanceResponse,
    AppearanceUpdateRequest,
)
from app.yullo.schemas.appearance_preview import (
    AppearancePreviewApplyRequest,
    AppearancePreviewContent,
    AppearancePreviewRequest,
    AppearancePreviewResponse,
    AppearanceRebuildLayoutRequest,
    AppearanceRebuildLayoutResponse,
)
from app.yullo.services.appearance_assets import (
    archive_asset,
    get_owned_asset,
    update_asset,
    upload_asset,
)
from app.yullo.services.appearance_assistant import (
    apply_appearance_command,
    recommend_appearance,
    rebuild_space_layout,
)
from app.yullo.services.appearance_preview import apply_appearance_preview_section, generate_appearance_preview, get_live_appearance_preview
from app.yullo.services.persistence.appearance import get_appearance, update_appearance

router = APIRouter(prefix="/yullo/spaces", tags=["yullo-appearance"])


@router.get("/{space_id}/appearance", response_model=AppearanceResponse, response_model_by_alias=True)
async def read_appearance(
    space_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_appearance(db, user_id=user.id, space_id=space_id)


@router.patch("/{space_id}/appearance", response_model=AppearanceResponse, response_model_by_alias=True)
async def save_appearance(
    space_id: UUID,
    payload: AppearanceUpdateRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await update_appearance(
        db, user_id=user.id, space_id=space_id, request=payload
    )
    await db.commit()
    return result


@router.post(
    "/{space_id}/appearance/assets",
    response_model=AppearanceAssetResponse,
    response_model_by_alias=True,
    status_code=201,
)
async def create_appearance_asset(
    space_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limit("yullo-appearance-upload", f"{user.id}:{space_id}", 20, 3600)
    result = await upload_asset(
        db, user_id=user.id, space_id=space_id, upload=file
    )
    await db.commit()
    return result


@router.get("/{space_id}/appearance/assets/{asset_id}/content")
async def read_appearance_asset_content(
    space_id: UUID,
    asset_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    asset = await get_owned_asset(
        db, user_id=user.id, space_id=space_id, asset_id=asset_id
    )
    async with materialize_blob(asset.storage_key) as path:
        return FileResponse(
            path,
            media_type=asset.mime_type,
            filename=asset.filename,
            content_disposition_type="inline",
            headers={"Cache-Control": "private, max-age=300"},
        )


@router.patch(
    "/{space_id}/appearance/assets/{asset_id}",
    response_model=AppearanceAssetResponse,
    response_model_by_alias=True,
)
async def edit_appearance_asset(
    space_id: UUID,
    asset_id: UUID,
    payload: AppearanceAssetUpdateRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await update_asset(
        db,
        user_id=user.id,
        space_id=space_id,
        asset_id=asset_id,
        request=payload,
    )
    await db.commit()
    return result


@router.delete("/{space_id}/appearance/assets/{asset_id}", status_code=204)
async def remove_appearance_asset(
    space_id: UUID,
    asset_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await archive_asset(
        db, user_id=user.id, space_id=space_id, asset_id=asset_id
    )
    await db.commit()
    return Response(status_code=204)


@router.post("/{space_id}/appearance/recommendation", response_model=AppearanceCandidateResponse, response_model_by_alias=True)
async def create_recommendation(
    space_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limit("yullo-appearance-recommend", f"{user.id}:{space_id}", 6, 60)
    appearance = await get_appearance(db, user_id=user.id, space_id=space_id)
    return await recommend_appearance(
        db,
        user_id=user.id,
        space_id=space_id,
        current=appearance.effective_config,
    )


@router.post("/{space_id}/appearance/rebuild-layout", response_model=AppearanceRebuildLayoutResponse, response_model_by_alias=True)
async def rebuild_appearance_layout(
    space_id: UUID,
    payload: AppearanceRebuildLayoutRequest = AppearanceRebuildLayoutRequest(),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limit("yullo-appearance-rebuild-layout", f"{user.id}:{space_id}", 10, 60)
    return await rebuild_space_layout(
        db,
        user_id=user.id,
        space_id=space_id,
        force=payload.force,
    )


@router.post("/{space_id}/appearance/command", response_model=AppearanceCandidateResponse, response_model_by_alias=True)
async def run_appearance_command(
    space_id: UUID,
    payload: AppearanceCommandRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limit("yullo-appearance-command", f"{user.id}:{space_id}", 20, 60)
    return await apply_appearance_command(
        db,
        user_id=user.id,
        space_id=space_id,
        request=payload,
    )


@router.post("/{space_id}/appearance/preview", response_model=AppearancePreviewResponse, response_model_by_alias=True)
async def generate_preview(
    space_id: UUID,
    payload: AppearancePreviewRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce_rate_limit("yullo-appearance-preview", f"{user.id}:{space_id}", 10, 60)
    return await generate_appearance_preview(
        db,
        user_id=user.id,
        space_id=space_id,
        request=payload,
    )


@router.get("/{space_id}/appearance/preview/live", response_model=AppearancePreviewContent, response_model_by_alias=True)
async def read_live_preview(
    space_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_live_appearance_preview(db, user_id=user.id, space_id=space_id)


@router.put("/{space_id}/appearance/preview/section", response_model=AppearancePreviewContent, response_model_by_alias=True)
async def apply_preview_section(
    space_id: UUID,
    payload: AppearancePreviewApplyRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await apply_appearance_preview_section(
        db, user_id=user.id, space_id=space_id, section=payload.section
    )
    await db.commit()
    return result

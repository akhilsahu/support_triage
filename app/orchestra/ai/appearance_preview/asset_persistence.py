from __future__ import annotations

import io
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.orchestra.ai.ingestion.storage import delete as storage_delete
from app.orchestra.ai.ingestion.storage import put as storage_put
from app.yullo.config.appearance import get_appearance_runtime_config
from app.yullo.models.appearance_asset import YulloAppearanceAsset
from app.yullo.schemas.appearance import AppearanceAssetResponse, AppearanceAssetUpdateRequest

_FORMAT_MIME = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
    "GIF": ("image/gif", "gif"),
}


def asset_response(asset: YulloAppearanceAsset) -> AppearanceAssetResponse:
    content_url = f"/api/v1/yullo/spaces/{asset.space_id}/appearance/assets/{asset.id}/content"
    return AppearanceAssetResponse(
        id=asset.id,
        filename=asset.filename,
        mimeType=asset.mime_type,
        byteSize=asset.byte_size,
        width=asset.width,
        height=asset.height,
        altText=asset.alt_text,
        url=content_url,
        thumbnailUrl=content_url,
    )


async def _require_owned_space(db: AsyncSession, *, user_id: UUID, space_id: UUID) -> None:
    exists = await db.scalar(
        select(Space.id)
        .join(YulloSpace, YulloSpace.space_id == Space.id)
        .where(
            Space.id == space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        )
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Yullo Space not found")


from urllib.parse import urlparse

from app.models.knowledge_base import KnowledgeBaseItem
from app.orchestra.ai.ingestion.scraper.asset_extractor import extract_markdown_assets


async def list_source_extracted_assets(
    db: AsyncSession, *, space_id: UUID, source_items=None, public_only=False,
) -> list[AppearanceAssetResponse]:
    """Collect image assets extracted during 'What Aura Knows' source ingestion."""
    if public_only:
        from app.orchestra.ai.db_utils.source_loader import active_chunk_doc_id
        from app.yullo.services.sources.service import public_source_asset
    if source_items is not None:
        items = [item for item in source_items if item.space_id == space_id]
    elif public_only:
        from app.orchestra.ai.db_utils.source_loader import resolve_space_kb_ids, load_published_chat_sources
        kb_ids = await resolve_space_kb_ids(db, space_id, product='yullo')
        items = await load_published_chat_sources(db, space_id, kb_ids, product='yullo')
    else:
        items = (
            await db.scalars(
                select(KnowledgeBaseItem)
                .where(KnowledgeBaseItem.space_id == space_id)
                .order_by(KnowledgeBaseItem.created_at.asc())
            )
        ).all()

    seen_urls: set[str] = set()
    extracted: list[AppearanceAssetResponse] = []

    for item in items:
        meta = item.source_metadata or {}
        if public_only:
            if not active_chunk_doc_id(item) or not public_source_asset(meta):
                continue
        source_assets = dict(meta.get("assets") or {})

        # If assets.images is empty, attempt fallback extraction from markdown preview
        preview_txt = meta.get("preview_excerpt")
        if not source_assets.get("images") and preview_txt:
            md_assets = extract_markdown_assets(preview_txt, item.source_locator or "")
            if md_assets.get("images"):
                source_assets["images"] = md_assets["images"]

        # Collect preview_image_url and images
        images = list(source_assets.get("images") or [])
        preview_img = meta.get("preview_image_url") or source_assets.get("preview_image_url")
        if preview_img and not any(isinstance(img, dict) and img.get("url") == preview_img for img in images):
            images.insert(0, {"url": preview_img, "alt": f"{item.title or 'Source'} Preview"})

        for img in images:
            if not isinstance(img, dict):
                continue
            if public_only and not public_source_asset(img):
                continue
            url = (img.get("url") or "").strip()
            if not url or not url.startswith(("http://", "https://")):
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            # Clean filename
            parsed = urlparse(url)
            raw_filename = parsed.path.split("/")[-1] if parsed.path else ""
            clean_filename = raw_filename.split("?")[0] if raw_filename else f"source_image_{len(extracted) + 1}.jpg"
            if not any(clean_filename.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]):
                clean_filename = f"{clean_filename}.jpg"

            ext = clean_filename.lower().split(".")[-1]
            mime = (
                "image/png" if ext == "png"
                else "image/webp" if ext == "webp"
                else "image/gif" if ext == "gif"
                else "image/svg+xml" if ext == "svg"
                else "image/jpeg"
            )

            alt = img.get("alt") or img.get("title") or (f"{item.title} Image" if item.title else clean_filename)
            asset_id = uuid.uuid5(uuid.NAMESPACE_URL, url)

            extracted.append(
                AppearanceAssetResponse(
                    id=asset_id,
                    filename=clean_filename,
                    mimeType=mime,
                    byteSize=1024,
                    width=1200,
                    height=800,
                    altText=alt,
                    url=url,
                    thumbnailUrl=url,
                    sourceType="extracted",
                )
            )

    return extracted


async def list_assets(
    db: AsyncSession, *, user_id: UUID, space_id: UUID
) -> list[AppearanceAssetResponse]:
    await _require_owned_space(db, user_id=user_id, space_id=space_id)
    uploaded = (
        await db.scalars(
            select(YulloAppearanceAsset)
            .where(
                YulloAppearanceAsset.space_id == space_id,
                YulloAppearanceAsset.status == "active",
            )
            .order_by(YulloAppearanceAsset.created_at.desc())
        )
    ).all()
    uploaded_responses = [asset_response(asset) for asset in uploaded]

    extracted_responses = await list_source_extracted_assets(db, space_id=space_id)
    uploaded_urls = {a.url for a in uploaded_responses}
    filtered_extracted = [a for a in extracted_responses if a.url not in uploaded_urls]

    return uploaded_responses + filtered_extracted


async def upload_asset(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    upload: UploadFile,
) -> AppearanceAssetResponse:
    runtime = get_appearance_runtime_config()
    await _require_owned_space(db, user_id=user_id, space_id=space_id)
    current_count = await db.scalar(
        select(func.count(YulloAppearanceAsset.id)).where(
            YulloAppearanceAsset.space_id == space_id,
            YulloAppearanceAsset.status == "active",
        )
    )
    if int(current_count or 0) >= runtime.max_assets:
        raise HTTPException(status_code=409, detail="This Space has reached its image limit")

    body = await upload.read(runtime.max_asset_bytes + 1)
    if not body:
        raise HTTPException(status_code=422, detail="Choose a non-empty image")
    if len(body) > runtime.max_asset_bytes:
        raise HTTPException(status_code=413, detail="Image exceeds the configured size limit")

    try:
        with Image.open(io.BytesIO(body)) as image:
            image_format = (image.format or "").upper()
            width, height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="The uploaded file is not a valid image") from exc

    if image_format not in _FORMAT_MIME:
        raise HTTPException(status_code=415, detail="Use a JPEG, PNG, WebP, or GIF image")
    if width * height > runtime.max_asset_pixels:
        raise HTTPException(status_code=413, detail="Image dimensions exceed the configured limit")

    mime_type, extension = _FORMAT_MIME[image_format]
    asset_id = uuid.uuid4()
    storage_key = await storage_put(
        space_id=space_id,
        key=f"appearance/{asset_id}.{extension}",
        body=body,
        content_type=mime_type,
    )
    filename = Path(upload.filename or f"image.{extension}").name[:255]
    asset = YulloAppearanceAsset(
        id=asset_id,
        space_id=space_id,
        storage_key=storage_key,
        filename=filename,
        mime_type=mime_type,
        byte_size=len(body),
        width=width,
        height=height,
        status="active",
    )
    db.add(asset)
    try:
        await db.flush()
    except Exception:
        await storage_delete(storage_key)
        raise
    return asset_response(asset)


async def get_owned_asset(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, asset_id: UUID
) -> YulloAppearanceAsset:
    asset = await db.scalar(
        select(YulloAppearanceAsset)
        .join(Space, Space.id == YulloAppearanceAsset.space_id)
        .where(
            YulloAppearanceAsset.id == asset_id,
            YulloAppearanceAsset.space_id == space_id,
            YulloAppearanceAsset.status == "active",
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        )
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Appearance image not found")
    return asset


async def update_asset(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    asset_id: UUID,
    request: AppearanceAssetUpdateRequest,
) -> AppearanceAssetResponse:
    asset = await get_owned_asset(
        db, user_id=user_id, space_id=space_id, asset_id=asset_id
    )
    asset.alt_text = request.alt_text.strip() if request.alt_text else None
    await db.flush()
    return asset_response(asset)


def config_references_asset(config: dict | None, asset_id: UUID) -> bool:
    target = str(asset_id)

    def walk(value: object) -> bool:
        if isinstance(value, dict):
            return any(walk(item) for item in value.values())
        if isinstance(value, list):
            return any(walk(item) for item in value)
        return str(value) == target

    return walk(config or {})


async def archive_asset(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, asset_id: UUID
) -> None:
    asset = await get_owned_asset(
        db, user_id=user_id, space_id=space_id, asset_id=asset_id
    )
    yullo_space = await db.scalar(
        select(YulloSpace).where(YulloSpace.space_id == space_id)
    )
    if yullo_space and config_references_asset(yullo_space.appearance_config, asset_id):
        raise HTTPException(status_code=409, detail="Remove this image from the saved appearance first")
    if yullo_space:
        from app.yullo.services.persistence.appearance import get_live_appearance_preview
        content = await get_live_appearance_preview(db, user_id=user_id, space_id=space_id, public=True)
        if any(item.asset_id == str(asset_id) for section in content.sections for item in section.items):
            raise HTTPException(status_code=409, detail="Remove this image from the saved section first")
    asset.status = "archived"
    await db.flush()

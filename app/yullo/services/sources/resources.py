"""Explicit sharing of original sources, independent of Aura indexing and fact review."""
import logging
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from app.yullo.models.source_resource import YulloSourceResource
from app.orchestra.ai.ingestion.storage import materialize

from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.yullo.services.spaces.hierarchy import live_branch_path

logger = logging.getLogger(__name__)


def resource_state(source, setting=None):
    return {"public_resource": bool(setting and setting.shared_source_version == (source.source_version or 1)),
            "resource_revision": setting.revision if setting else 0}


def missing_resource_table(error):
    original = error.orig
    return (getattr(original, "sqlstate", getattr(original, "pgcode", None)) == "42P01"
            and "yullo_source_resources" in str(original))


async def resource_settings(db, space_id):
    try:
        async with db.begin_nested():
            rows = (await db.scalars(select(YulloSourceResource).where(YulloSourceResource.space_id == space_id))).all()
        return {row.source_id: row for row in rows}
    except ProgrammingError as error:
        if not missing_resource_table(error):
            raise
        # Optional resource sharing cannot break ordinary source management before migration.
        return {}


def resource_kind(source):
    if source.item_type == "url":
        return "link"
    if source.item_type in ("text", "qna"):
        return "note"
    extension = PurePosixPath(source.source_locator or source.title or "").suffix.lower()
    return "pdf" if extension == ".pdf" else "image" if extension in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif") else "file"


def original_blob_key(source):
    key = source.source_locator or ""
    if "/" not in key:
        key = f"{source.space_id}/{key}"
    path = PurePosixPath(key)
    if (not key or "\\" in key or path.is_absolute() or ".." in path.parts
            or not path.parts or path.parts[0] != str(source.space_id) or len(path.parts) < 2):
        raise HTTPException(404, "Resource not available")
    return key


def original_url(source):
    value = source.source_locator or source.content or ""
    try:
        url = urlsplit(value)
        if (url.scheme not in ("http", "https") or not url.hostname or url.username or url.password
                or any(ord(char) < 32 for char in value)):
            raise ValueError()
    except ValueError:
        raise HTTPException(404, "Resource not available") from None
    return value


async def update_resource(db, *, user_id, space_id, source_id, data):
    # Lock Space before source, matching existing source mutations/deletion.
    owned = await db.scalar(select(Space.id).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo",
    ).with_for_update(of=Space))
    if owned is None:
        raise HTTPException(404, "Source not found")
    source = await db.scalar(select(KnowledgeBaseItem).where(
        KnowledgeBaseItem.id == source_id, KnowledgeBaseItem.space_id == space_id,
    ).with_for_update().execution_options(populate_existing=True))
    if source is None:
        raise HTTPException(404, "Source not found")
    try:
        setting = await db.scalar(select(YulloSourceResource).where(
            YulloSourceResource.source_id == source_id, YulloSourceResource.space_id == space_id,
        ).with_for_update())
    except ProgrammingError as error:
        if not missing_resource_table(error):
            raise
        raise HTTPException(503, "Resource sharing is not available yet") from None
    current = resource_state(source, setting)
    if data.expected_source_version != (source.source_version or 1) or data.expected_revision != current["resource_revision"]:
        raise HTTPException(409, "Source changed. Refresh it before updating resource sharing.")
    if data.enabled:
        if resource_kind(source) == "link":
            original_url(source)
        elif source.item_type not in ("text", "qna") or source.source_locator:
            try:
                async with materialize(original_blob_key(source)) as path:
                    if not path.is_file():
                        raise FileNotFoundError()
            except FileNotFoundError:
                raise HTTPException(422, "The original file is no longer available to share") from None
        elif not source.content:
            raise HTTPException(422, "This source has no original content to share")
    if setting is None:
        setting = YulloSourceResource(source_id=source_id, space_id=space_id, source_kb_id=source.kb_id, revision=1)
        db.add(setting)
    else:
        setting.revision += 1
    setting.shared_source_version = (source.source_version or 1) if data.enabled else None
    from app.yullo.services.persistence.common import finalize_space_mutation
    await finalize_space_mutation(db, user_id=user_id, space_id=space_id,
        public_content_changed=True, operation_key="source.resource.update")
    await db.commit()
    logger.info("yullo.resource.sharing_updated", extra={"space_id": str(space_id), "source_id": str(source_id), "enabled": data.enabled})
    return resource_state(source, setting)


async def require_public_resource_space(db, space_id):
    row = (await db.execute(select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == space_id, Space.product == "yullo", Space.active.is_(True), Space.status == "live",
        YulloSpace.lifecycle_status == "live",
    ))).first()
    if row is None or not await live_branch_path(db, *row):
        raise HTTPException(404, "Resources not available")


def _source_query(space_id):
    return select(KnowledgeBaseItem).join(KnowledgeBase, KnowledgeBase.id == KnowledgeBaseItem.kb_id).where(
        KnowledgeBaseItem.space_id == space_id, KnowledgeBase.space_id == space_id, KnowledgeBase.active.is_(True),
    )


async def list_public_resources(db, space_id):
    await require_public_resource_space(db, space_id)
    settings = await resource_settings(db, space_id)
    if not settings:
        return []
    rows = (await db.scalars(_source_query(space_id).order_by(KnowledgeBaseItem.created_at, KnowledgeBaseItem.id))).all()
    result = []
    for source in rows:
        if not resource_state(source, settings.get(source.id))["public_resource"]:
            continue
        kind = resource_kind(source)
        try:
            if kind == "link":
                original_url(source)
            elif source.source_locator:
                original_blob_key(source)
            elif not source.content:
                continue
        except HTTPException:
            continue
        result.append({"id": str(source.id), "title": source.title or "Resource", "kind": kind,
            "href": f"/api/v1/yullo/public/spaces/{space_id}/resources/{source.id}?version={source.source_version or 1}"})
    return result


async def get_public_resource(db, space_id, source_id, version):
    await require_public_resource_space(db, space_id)
    source = await db.scalar(_source_query(space_id).where(KnowledgeBaseItem.id == source_id))
    settings = await resource_settings(db, space_id)
    if source is None or not resource_state(source, settings.get(source.id))["public_resource"] or (source.source_version or 1) != version:
        raise HTTPException(404, "Resource not available")
    return source

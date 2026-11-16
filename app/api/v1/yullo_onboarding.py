import logging
import uuid
import re
from datetime import datetime, timedelta
import asyncio
import json
from sse_starlette.sse import EventSourceResponse
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Response, UploadFile, status, Request, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.auth import current_user
from app.models.user import User
from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_config import YulloConfig
from app.models.knowledge_base import KnowledgeBaseItem
from app.models.ingestion_job import IngestionJob
from app.schemas.yullo_onboarding import (
    DraftSpaceResponse,
    OnboardingDraftCreate,
    OnboardingDraftUpdate,
    HandleValidateRequest,
    HandleValidateResponse,
    SourceUrlRequest,
    SourceTextRequest,
    SourceUpdateRequest,
    SourceDeleteRequest,
    PreviewRequest,
    LaunchRequest,
    SpaceSourceResponse,
    GenerateSummaryRequest,
    GenerateSummaryResponse
)
from app.yullo.services.sources.service import SourceService
from app.yullo.services.sources.contracts import FileSourceInput, UrlSourceInput, TextSourceInput
from app.yullo.services.spaces.creation import create_or_resolve_yullo_space
from app.yullo.services.spaces.publication import publish_space
from app.yullo.services.spaces.hierarchy import lock_hierarchy, require_no_children
from app.yullo.services.spaces.handles import validate_handle_format_and_availability
from app.orchestra.ai.data_generation.identity_generate import suggest_about

router = APIRouter(prefix="/yullo/onboarding", tags=["yullo-onboarding"])


async def _resolve_source_space(db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID | None) -> Space:
    query = select(Space).where(Space.owner_user_id == user_id, Space.product == "yullo")
    if space_id is None:
        await lock_hierarchy(db, user_id)
        query = query.where(Space.status == "draft", Space.current_step != "managed")
    else:
        query = query.where(Space.id == space_id)
    space = (await db.execute(query)).scalars().first()
    if not space:
        raise HTTPException(status_code=404, detail="Yullo space not found or not owned by user")
    return space


def _enqueue_ingestion(job_id: uuid.UUID) -> None:
    from app.orchestra.ai.ingestion.jobs import get_job_runner

    get_job_runner().enqueue("ingest_knowledge_item", job_id=str(job_id))

@router.get("/draft", response_model=DraftSpaceResponse)
async def get_draft(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Space)
        .where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft", Space.current_step != "managed")
    )
    draft = result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="No active draft found.")
        
    source_service = SourceService()
    sources = await source_service.get_space_sources(db, draft.id)
    return _build_draft_response(draft, sources)

@router.delete("/draft", response_model=DraftSpaceResponse)
async def reset_draft(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Deletes the current active draft space (and associated draft sources) for the user
    and initializes a clean, empty draft space.
    """
    await lock_hierarchy(db, user.id)
    result = await db.execute(
        select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft", Space.current_step != "managed")
    )
    existing = result.scalars().first()
    if existing:
        await require_no_children(db, existing.id)
        await db.delete(existing)
        await db.commit()

    temp_slug = f"draft-{uuid.uuid4().hex[:8]}"
    created = await create_or_resolve_yullo_space(
        db,
        owner_user_id=user.id,
        slug=temp_slug,
        purpose="business",
        title="My Space",
        status="draft",
        current_step="claim"
    )
    await db.commit()
    
    refreshed = await db.execute(
        select(Space).where(Space.id == created.space.id)
    )
    return _build_draft_response(refreshed.scalars().first(), [])

def _build_draft_response(draft: Space, sources=None):
    if sources is None:
        sources = []
            
    return {
        "id": draft.id,
        "purpose": draft.purpose,
        "name": draft.display_name,
        "handle": draft.slug,
        "image_url": draft.logo_url,
        "current_step": draft.current_step,
        "status": draft.status,
        "sources": [
            {
                "id": source.id,
                "source_type": source.source_type,
                "content_ref": source.content_ref,
                "status": source.status,
                "title": getattr(source, 'title', None),
                "facts": getattr(source, 'facts', []),
                "target_badges": getattr(source, 'target_badges', ["About", "Category", "Aura knowledge"]),
                "raw_text": getattr(source, 'raw_text', None),
                "is_confirmed": getattr(source, 'is_confirmed', False),
                "prompt_version": getattr(source, 'prompt_version', "v1"),
                "source_version": getattr(source, 'source_version', 1),
                "error_msg": source.error_msg,
                "created_at": source.created_at
            }
            for source in sources
        ] if sources else []
    }

@router.post("/draft", response_model=DraftSpaceResponse)
async def create_draft(req: OnboardingDraftCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await lock_hierarchy(db, user.id)
    # Idempotency: check if one already exists
    result = await db.execute(
        select(Space)
        .where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft", Space.current_step != "managed")
    )
    existing = result.scalars().first()
    if existing:
        existing.purpose = req.purpose
        existing.current_step = "claim"
        await db.commit()
        # Re-fetch to get relationships after commit
        refreshed = await db.execute(
            select(Space).where(Space.id == existing.id)
        )
        source_service = SourceService()
        sources = await source_service.get_space_sources(db, existing.id)
        return _build_draft_response(refreshed.scalars().first(), sources)
        
    temp_slug = f"draft-{uuid.uuid4().hex[:8]}"
    created = await create_or_resolve_yullo_space(
        db,
        owner_user_id=user.id,
        slug=temp_slug,
        purpose=req.purpose,
        title="My Space",
        status="draft",
        current_step="claim"
    )
    await db.commit()
    
    # Refresh newly created draft Space for relationships
    refreshed = await db.execute(
        select(Space).where(Space.id == created.space.id)
    )
    return _build_draft_response(refreshed.scalars().first(), [])

@router.patch("/draft", response_model=DraftSpaceResponse)
async def update_draft(req: OnboardingDraftUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await lock_hierarchy(db, user.id)
    result = await db.execute(
        select(Space)
        .where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft", Space.current_step != "managed")
    )
    draft = result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="No active draft found.")
        
    if req.name is not None:
        trimmed_name = req.name.strip()
        if trimmed_name:
            draft.display_name = trimmed_name

    if req.purpose is not None:
        from app.yullo.services.persistence.identity import normalize_purpose
        canonical_p = normalize_purpose(req.purpose)
        draft.purpose = canonical_p
        
        yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == draft.id))
        if yullo_space:
            yullo_space.purpose = canonical_p

    if any(value is not None for value in (req.description, req.description_source, req.category, req.category_source)):
        yullo_config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == draft.id))
        if not yullo_config:
            yullo_config = YulloConfig(space_id=draft.id, settings={})
            db.add(yullo_config)
            
        settings = dict(yullo_config.settings) if yullo_config.settings else {}
        identity_settings = dict(settings.get("identity", {}))
        if req.description is not None:
            identity_settings["description"] = req.description
        if req.description_source is not None:
            identity_settings["description_source"] = req.description_source
        if req.category is not None:
            identity_settings["category"] = req.category
        if req.category_source is not None:
            identity_settings["category_source"] = req.category_source
        settings["identity"] = identity_settings
        yullo_config.settings = settings
    
    await db.commit()
    
    source_service = SourceService()
    sources = await source_service.get_space_sources(db, draft.id)
    return _build_draft_response(draft, sources)

@router.post("/validate-handle", response_model=HandleValidateResponse)
async def validate_handle(req: HandleValidateRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await validate_handle_format_and_availability(db, req.handle, user.id)

@router.post("/reserve-handle")
async def reserve_handle(req: HandleValidateRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await lock_hierarchy(db, user.id)
    clean_handle = req.handle.strip().lower()
    
    result = await db.execute(
        select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft", Space.current_step != "managed")
    )
    draft = result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="No active draft found.")
        
    validation = await validate_handle_format_and_availability(db, clean_handle, user.id)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["reason"])

    if draft.slug == clean_handle:
        draft.handle_reserved_until = datetime.utcnow() + timedelta(hours=72)
        draft.current_step = "teach"
        await db.commit()
        return {"ok": True}
        
    collision = await db.execute(select(Space).where(Space.slug == clean_handle).with_for_update())
    other_space = collision.scalars().first()
    if other_space:
        if other_space.status == "live" or other_space.current_step == "managed":
            raise HTTPException(status_code=400, detail="Handle is taken.")
        if other_space.handle_reserved_until and other_space.handle_reserved_until > datetime.utcnow():
            raise HTTPException(status_code=400, detail="Handle is taken.")
            
        other_space.slug = f"expired-{uuid.uuid4().hex[:8]}"
        await db.flush()
        
    try:
        draft.slug = clean_handle
        draft.handle_reserved_until = datetime.utcnow() + timedelta(hours=72)
        draft.current_step = "teach"
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Failed to reserve handle. It may have been taken.")
        
    return {"ok": True}

@router.post("/sources/url", response_model=SpaceSourceResponse)
async def add_source_url(
    req: SourceUrlRequest, 
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user), 
    db: AsyncSession = Depends(get_db)
):
    draft = await _resolve_source_space(db, user_id=user.id, space_id=req.space_id)
        
    target_url = req.url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    command = UrlSourceInput(url=target_url, title=req.title)
    service = SourceService()
    try:
        accepted = await service.accept_source(
            db=db,
            user_id=user.id,
            space_id=draft.id,
            command=command,
            idempotency_key=uuid.uuid5(uuid.NAMESPACE_URL, target_url)
        )
        # This worker owns indexing and extraction; the dispatcher must not
        # duplicate it. Repeated submissions return the existing job state.
        preview_job = await db.get(IngestionJob, accepted.job_id)
        preview_item = await db.get(KnowledgeBaseItem, accepted.item_id)
        if preview_job and preview_job.status in ('running', 'done', 'failed', 'cancelled'):
            await db.commit()
            return await service.get_source(db, user_id=user.id, source_id=accepted.item_id)
        if preview_job:
            preview_job.status = 'running'
            preview_job.stage_detail = 'Reading source...'
            preview_job.progress = 25
        if preview_item:
            preview_item.ingestion_status = 'processing'
            preview_item.source_metadata = {**(preview_item.source_metadata or {}),
                                            'status': 'processing', 'stage': 'Reading source...', 'progress': 25}
        await db.commit()

        if req.background:
            # Mark job and item as processing in the background immediately
            preview_job = await db.get(IngestionJob, accepted.job_id)
            if preview_job and preview_job.status in ('pending_confirm', 'awaiting_confirmation'):
                preview_job.status = "running"
                preview_job.stage_detail = "Generating preview..."
                preview_job.progress = 25
            kb_item = await db.get(KnowledgeBaseItem, accepted.item_id)
            if kb_item:
                meta = kb_item.source_metadata or {}
                meta.update({"status": "processing", "stage": "Generating preview...", "progress": 25})
                kb_item.source_metadata = meta
            await db.commit()

            async def _bg_preview_task(
                space_id: uuid.UUID,
                user_id: uuid.UUID,
                item_id: uuid.UUID,
                job_id: uuid.UUID,
                url: str
            ):
                from app.core.database import AsyncSessionLocal
                from app.yullo.services.sources.preview import extract_and_persist_link_preview
                async with AsyncSessionLocal() as session:
                    try:
                        await extract_and_persist_link_preview(
                            db=session,
                            user_id=user_id,
                            space_id=space_id,
                            item_id=item_id,
                            url=url,
                        )
                    except Exception as bg_err:
                        logger.error(f"Background preview failed for {url}: {bg_err}", exc_info=True)
                        await session.rollback()
                        item = await session.scalar(select(KnowledgeBaseItem).where(
                            KnowledgeBaseItem.id == item_id,
                            KnowledgeBaseItem.space_id == space_id,
                        ).with_for_update().execution_options(populate_existing=True))
                        if not item:
                            return
                        job = await session.get(IngestionJob, job_id)
                        if not job or (job.source_version or 1) != (item.source_version or 1):
                            return
                        if job and job.status == 'running':
                            job.status = 'failed'
                            job.stage_detail = 'Preview failed'
                        meta = dict(item.source_metadata or {})
                        meta.update({'status': 'failed', 'error_msg': 'Website preview failed'})
                        item.source_metadata = meta
                        await session.commit()

            background_tasks.add_task(
                _bg_preview_task,
                draft.id,
                user.id,
                accepted.item_id,
                accepted.job_id,
                target_url
            )

            return {
                "id": accepted.item_id,
                "source_type": "url",
                "content_ref": target_url,
                "status": "processing",
                "title": req.title or target_url,
                "facts": [],
                "target_badges": ["About", "Category", "Aura knowledge"],
                "preview_excerpt": "",
                "is_confirmed": True,
                "prompt_version": "v1",
                "source_version": 1,
                "error_msg": None,
                "created_at": datetime.utcnow(),
                "stage": "Generating preview...",
                "progress": 25,
            }

        from app.yullo.services.sources.preview import extract_and_persist_link_preview
        preview_res = await extract_and_persist_link_preview(
            db=db,
            user_id=user.id,
            space_id=draft.id,
            item_id=accepted.item_id,
            url=target_url
        )

        return {
            "id": accepted.item_id,
            "source_type": "url",
            "content_ref": target_url,
            "status": preview_res.get("status", "ready"),
            "title": preview_res.get("title", target_url),
            "facts": preview_res.get("facts", []),
            "target_badges": preview_res.get("target_badges", ["About", "Category", "Aura knowledge"]),
            "preview_excerpt": preview_res.get("raw_text", ""),
            "is_confirmed": preview_res.get("is_confirmed", True),
            "prompt_version": preview_res.get("prompt_version", "v1"),
            "source_version": preview_res.get("source_version", 1),
            "error_msg": None,
            "created_at": datetime.utcnow(),
            "favicon_url": preview_res.get("favicon_url"),
            "preview_image_url": preview_res.get("preview_image_url"),
            "assets": preview_res.get("assets"),
        }
    except Exception as e:
        await db.rollback()
        raise e

@router.post("/sources/text", response_model=SpaceSourceResponse)
async def add_source_text(req: SourceTextRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    draft = await _resolve_source_space(db, user_id=user.id, space_id=req.space_id)
        
    command = TextSourceInput(title=req.title or "Pasted Text", text=req.text)
    service = SourceService()
    try:
        # Use a stable hash of the text for idempotency
        import hashlib
        text_hash = hashlib.md5(req.text.encode('utf-8')).hexdigest()
        accepted = await service.accept_source(
            db=db,
            user_id=user.id,
            space_id=draft.id,
            command=command,
            idempotency_key=uuid.UUID(text_hash.ljust(32, '0')[:32])
        )
        await db.commit()
        _enqueue_ingestion(accepted.job_id)
        return await service.get_source(db, user_id=user.id, source_id=accepted.item_id)
    except Exception as e:
        await db.rollback()
        raise e


@router.post("/sources/file", response_model=SpaceSourceResponse)
async def add_source_file(
    file: UploadFile = File(...),
    space_id: uuid.UUID | None = Form(None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    space = await _resolve_source_space(db, user_id=user.id, space_id=space_id)
    original_filename = (file.filename or "document").replace("\\", "/").split("/")[-1].strip()
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", original_filename)[:200] or "document"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_extensions = {"pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg", "webp"}
    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Use a PDF, DOCX, TXT, Markdown, PNG, JPG or WebP file")

    body = await file.read()
    max_bytes = 20 * 1024 * 1024
    if not body:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(body) > max_bytes:
        raise HTTPException(status_code=400, detail="File is larger than 20 MB")

    from app.orchestra.ai.ingestion.storage import put as storage_put

    blob_key = await storage_put(
        space_id=space.id,
        key=f"file_{uuid.uuid4().hex}_{filename}",
        body=body,
        content_type=file.content_type or "application/octet-stream",
    )
    service = SourceService()
    accepted = await service.accept_source(
        db=db,
        user_id=user.id,
        space_id=space.id,
        command=FileSourceInput(
            title=filename,
            blob_key=blob_key,
            mime_type=file.content_type or "application/octet-stream",
        ),
        idempotency_key=uuid.uuid4(),
    )
    await db.commit()
    _enqueue_ingestion(accepted.job_id)
    return await service.get_source(db, user_id=user.id, source_id=accepted.item_id)


@router.get("/spaces/{space_id}/sources", response_model=list[SpaceSourceResponse])
async def list_space_sources(
    space_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await _resolve_source_space(db, user_id=user.id, space_id=space_id)
    return await SourceService().get_space_sources(db, space_id)


@router.get("/spaces/{space_id}/sources/stream")
async def stream_space_sources(
    space_id: uuid.UUID,
    request: Request,
    user: User = Depends(current_user),
):
    from app.yullo.services.sources.stream import source_stream

    async def fetch_latest_sources():
        async for db in get_db():
            await _resolve_source_space(db, user_id=user.id, space_id=space_id)
            sources = await SourceService().get_space_sources(db, space_id)
            return [s.model_dump(mode="json") for s in sources]
        return []

    async def event_generator():
        async for event in source_stream.subscribe(space_id, fetch_latest_sources):
            if await request.is_disconnected():
                break
            yield event

    return EventSourceResponse(event_generator())


@router.get("/sources/{source_id}", response_model=SpaceSourceResponse)
async def get_source(
    source_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await SourceService().get_source(db, user_id=user.id, source_id=source_id)


@router.get("/sources/{source_id}/content")
async def get_source_content(
    source_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SourceService()
    await service.get_source(db, user_id=user.id, source_id=source_id)
    item = await db.get(KnowledgeBaseItem, source_id)
    metadata = item.source_metadata or {}
    blob_key = metadata.get("extracted_text_blob_key")
    if blob_key:
        from app.orchestra.ai.ingestion.storage import materialize

        async with materialize(blob_key) as path:
            content = path.read_text(encoding="utf-8", errors="replace")
    else:
        content = metadata.get("raw_text") or metadata.get("preview_excerpt") or ""
    return Response(content=content, media_type="text/plain; charset=utf-8")


@router.patch("/sources/{source_id}", response_model=SpaceSourceResponse)
async def update_source(
    source_id: uuid.UUID,
    req: SourceUpdateRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SourceService()
    job_id = None
    if req.is_confirmed is not None:
        job_id = await service.set_source_confirmation(
            db,
            user_id=user.id,
            source_id=source_id,
            is_confirmed=req.is_confirmed,
        )
    await db.commit()
    if job_id:
        _enqueue_ingestion(job_id)
    return await service.get_source(db, user_id=user.id, source_id=source_id)

@router.get("/sources/{source_id}/deletion-impact")
async def get_source_deletion_impact(
    source_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await SourceService().get_deletion_impact(db, user_id=user.id, source_id=source_id)


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: uuid.UUID,
    req: SourceDeleteRequest | None = Body(default=None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SourceService()
    payload = req or SourceDeleteRequest()
    return await service.delete_source(
        db,
        user_id=user.id,
        space_id=None,
        source_id=source_id,
        derived_data=payload.derived_data,
        expected_source_version=payload.expected_source_version,
    )

@router.post("/preview")
async def generate_preview(req: PreviewRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await lock_hierarchy(db, user.id)
    result = await db.execute(select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft", Space.current_step != "managed"))
    draft = result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="No active draft found.")
        
    draft.current_step = "preview"
    draft.preview_context_version = draft.context_version
    await db.commit()
    
    return {"ok": True, "message": "Preview generated successfully."}

@router.post("/launch")
async def launch_space(
    req: LaunchRequest | None = Body(default=None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await lock_hierarchy(db, user.id)
    selected_id = req.space_id if req else None
    query = select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo")
    if selected_id:
        query = query.where(Space.id == selected_id)
    else:
        query = query.where(Space.status == "draft", Space.current_step != "managed")
    draft = (await db.execute(query)).scalars().first()
    if not draft:
        # Older clients send no ID; preserve their already-launched response.
        # Current clients always retry against the explicit selected Space above.
        if selected_id is None:
            live = (await db.execute(select(Space).where(
                Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "live"
            ))).scalars().first()
            if live:
                return {"ok": True, "space_id": str(live.id), "handle": live.slug,
                        "status": "live", "public_path": f"/yullo/spaces/{live.id}"}
        raise HTTPException(status_code=404, detail="No active draft found.")
    if draft.status != "draft" and not (selected_id and draft.status == "live"):
        raise HTTPException(status_code=409, detail="This Space cannot be launched.")

    if not draft.slug or draft.slug.startswith("draft-"):
        raise HTTPException(status_code=400, detail="Invalid handle. Please reserve a handle before launching.")
        
    try:
        await publish_space(db, space_id=draft.id, owner_user_id=user.id)
        draft.handle_reserved_until = None
        user.onboarding_completed = True
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e
        
    return {
        "ok": True,
        "space_id": str(draft.id),
        "handle": draft.slug,
        "status": "live",
        "public_path": f"/yullo/spaces/{draft.id}"
    }

@router.post("/generate-summary", response_model=GenerateSummaryResponse)
async def generate_summary(
    req: GenerateSummaryRequest, 
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    if req.space_id:
        space = await db.scalar(select(Space).where(Space.id == req.space_id, Space.owner_user_id == user.id, Space.product == "yullo"))
        if not space:
            raise HTTPException(status_code=403, detail="Not authorized")
    result = await suggest_about(
        db,
        user_id=user.id,
        space_id=req.space_id,
        draft_website=req.website,
        override_name=req.name,
        client_sources=req.sources,
        history=req.history,
        user_message=req.user_message,
        draft_purpose=req.purpose,
        draft_category=req.category,
        category_source=req.category_source,
        draft_presence=req.presence,
        draft_description=req.description,
        description_source=req.description_source,
    )
    return GenerateSummaryResponse(
        status=result["status"],
        description=result.get("description"),
        category=result.get("category"),
        claims=result.get("claims", []),
        clarification=result.get("clarification"),
        candidate_match=result.get("candidate_match"),
        prompt_version=result.get("prompt_version", "v1"),
        input_fingerprint=result.get("input_fingerprint"),
        context_version=1
    )




@router.post("/spaces/{space_id}/sources/{source_id}/retry", response_model=SpaceSourceResponse)
async def retry_space_source(
    space_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    item = await db.get(KnowledgeBaseItem, source_id)
    if not item or item.space_id != space_id:
        raise HTTPException(status_code=404, detail="Source not found")
        
    space_check = await db.scalar(select(Space).where(Space.id == item.space_id, Space.owner_user_id == user.id, Space.product == "yullo"))
    if not space_check:
        raise HTTPException(status_code=403, detail="Not authorized")

    accepted = await SourceService().retry_source(
        db,
        user_id=user.id,
        space_id=item.space_id,
        item_id=item.id,
        idempotency_key=uuid.uuid4(),
    )
    item.ingestion_status = "processing"
    await db.commit()
    _enqueue_ingestion(accepted.job_id)
    return await SourceService().get_source(db, user_id=user.id, source_id=item.id)


@router.delete("/spaces/{space_id}")
async def delete_onboarding_space_endpoint(
    space_id: uuid.UUID,
    action: str = "archive",
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.yullo.services.persistence.identity import delete_or_archive_space
    return await delete_or_archive_space(db, space_id, user.id, action)

import uuid
import re
from datetime import datetime, timedelta
import asyncio
import json
from sse_starlette.sse import EventSourceResponse
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
    PreviewRequest,
    SpaceSourceResponse,
    GenerateSummaryRequest,
    GenerateSummaryResponse
)
from app.yullo.services.sources.service import SourceService
from app.yullo.services.sources.contracts import FileSourceInput, UrlSourceInput, TextSourceInput
from app.yullo.services.spaces.creation import create_or_resolve_yullo_space
from app.yullo.services.spaces.publication import publish_space
from app.yullo.services.spaces.handles import validate_handle_format_and_availability
from app.yullo.services.about_generation import suggest_about

router = APIRouter(prefix="/yullo/onboarding", tags=["yullo-onboarding"])


async def _resolve_source_space(db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID | None) -> Space:
    query = select(Space).where(Space.owner_user_id == user_id, Space.product == "yullo")
    if space_id is None:
        query = query.where(Space.status == "draft")
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
        .where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft")
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
    result = await db.execute(
        select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft")
    )
    existing = result.scalars().first()
    if existing:
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
    # Idempotency: check if one already exists
    result = await db.execute(
        select(Space)
        .where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft")
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
    result = await db.execute(
        select(Space)
        .where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft")
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

    if req.description is not None or req.description_source is not None:
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
    clean_handle = req.handle.strip().lower()
    
    result = await db.execute(
        select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft")
    )
    draft = result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="No active draft found.")
        
    if draft.slug == clean_handle:
        draft.handle_reserved_until = datetime.utcnow() + timedelta(hours=72)
        draft.current_step = "teach"
        await db.commit()
        return {"ok": True}
        
    collision = await db.execute(select(Space).where(Space.slug == clean_handle))
    other_space = collision.scalars().first()
    if other_space:
        if other_space.status == "live":
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
async def add_source_url(req: SourceUrlRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
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
        await db.commit()

        from app.yullo.services.sources.preview import extract_and_persist_link_preview
        preview_res = await extract_and_persist_link_preview(
            db=db,
            user_id=user.id,
            space_id=draft.id,
            item_id=accepted.item_id,
            url=target_url
        )

        # A URL preview is already available from the lightweight scraper.
        # Hold the prepared ingestion job until the owner selects Add to Aura;
        # this prevents indexing/fact extraction before explicit confirmation.
        preview_job = await db.get(IngestionJob, accepted.job_id)
        if preview_job and (preview_job.status or "").lower() == "queued":
            preview_job.status = "awaiting_confirmation"
            preview_job.stage_detail = "Preview ready"
            await db.commit()

        return {
            "id": accepted.item_id,
            "source_type": "url",
            "content_ref": target_url,
            "status": preview_res.get("status", "ready"),
            "title": preview_res.get("title", target_url),
            "facts": preview_res.get("facts", []),
            "target_badges": preview_res.get("target_badges", ["About", "Category", "Aura knowledge"]),
            "preview_excerpt": preview_res.get("raw_text", ""),
            "is_confirmed": preview_res.get("is_confirmed", False),
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
    allowed_extensions = {"pdf", "docx", "txt", "md", "markdown"}
    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Use a PDF, DOCX, TXT, or Markdown file")

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
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            
            async for db in get_db():
                try:
                    await _resolve_source_space(db, user_id=user.id, space_id=space_id)
                    sources = await SourceService().get_space_sources(db, space_id)
                    data = [s.model_dump(mode="json") for s in sources]
                    yield {
                        "event": "update",
                        "data": json.dumps(data)
                    }
                except Exception as e:
                    yield {"event": "error", "data": str(e)}
                    break
            
            await asyncio.sleep(4.0)

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

@router.delete("/sources/{source_id}")
async def delete_source(source_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    service = SourceService()
    await service.delete_source(db, user_id=user.id, space_id=None, source_id=source_id)
    return {"ok": True}

@router.post("/preview")
async def generate_preview(req: PreviewRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft"))
    draft = result.scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="No active draft found.")
        
    draft.current_step = "preview"
    draft.preview_context_version = draft.context_version
    await db.commit()
    
    return {"ok": True, "message": "Preview generated successfully."}

@router.post("/launch")
async def launch_space(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "draft")
    )
    draft = result.scalars().first()
    if not draft:
        already_live = await db.execute(select(Space).where(Space.owner_user_id == user.id, Space.product == "yullo", Space.status == "live"))
        if already_live.scalars().first():
            return {"ok": True, "message": "Already launched."}
        raise HTTPException(status_code=404, detail="No active draft found.")
        
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
        draft_website=req.website
    )
    return GenerateSummaryResponse(
        status=result["status"],
        description=result.get("description"),
        claims=result.get("claims", []),
        clarification=result.get("clarification"),
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

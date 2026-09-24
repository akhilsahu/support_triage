import uuid
import re
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.auth import current_user
from app.models.user import User
from app.models.space import Space
from app.schemas.yullo_onboarding import (
    DraftSpaceResponse,
    OnboardingDraftCreate,
    OnboardingDraftUpdate,
    HandleValidateRequest,
    HandleValidateResponse,
    SourceUrlRequest,
    SourceTextRequest,
    PreviewRequest,
    SpaceSourceResponse,
    GenerateSummaryRequest,
    GenerateSummaryResponse
)
from app.yullo.services.sources.service import SourceService
from app.yullo.services.sources.contracts import UrlSourceInput, TextSourceInput, SourceAccepted
from app.yullo.services.spaces.creation import create_or_resolve_yullo_space
from app.yullo.services.spaces.publication import publish_space
from app.yullo.services.spaces.handles import validate_handle_format_and_availability
from app.yullo.services.about_generation import suggest_about

router = APIRouter(prefix="/yullo/onboarding", tags=["yullo-onboarding"])

@router.get("/draft", response_model=DraftSpaceResponse)
async def get_draft(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Space)
        .where(Space.owner_user_id == user.id, Space.status == "draft")
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
        select(Space).where(Space.owner_user_id == user.id, Space.status == "draft")
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
        .where(Space.owner_user_id == user.id, Space.status == "draft")
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
        .where(Space.owner_user_id == user.id, Space.status == "draft")
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
        select(Space).where(Space.owner_user_id == user.id, Space.status == "draft")
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
    space_id = req.space_id
    if not space_id:
        result = await db.execute(select(Space).where(Space.owner_user_id == user.id, Space.status == "draft"))
        draft = result.scalars().first()
    else:
        result = await db.execute(select(Space).where(Space.id == space_id, Space.owner_user_id == user.id, Space.status == "draft"))
        draft = result.scalars().first()

    if not draft:
        raise HTTPException(status_code=404, detail="Active draft space not found or not owned by user.")
        
    target_url = req.url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    command = UrlSourceInput(url=target_url)
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

        return {
            "id": accepted.item_id,
            "source_type": "url",
            "content_ref": target_url,
            "status": preview_res.get("status", "ready"),
            "title": preview_res.get("title", target_url),
            "facts": preview_res.get("facts", []),
            "target_badges": preview_res.get("target_badges", ["About", "Category", "Aura knowledge"]),
            "raw_text": preview_res.get("raw_text", ""),
            "is_confirmed": preview_res.get("is_confirmed", False),
            "prompt_version": preview_res.get("prompt_version", "v1"),
            "source_version": preview_res.get("source_version", 1),
            "error_msg": None,
            "created_at": datetime.utcnow()
        }
    except Exception as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        raise e

@router.post("/sources/text", response_model=SourceAccepted)
async def add_source_text(req: SourceTextRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    space_id = req.space_id
    if not space_id:
        result = await db.execute(select(Space).where(Space.owner_user_id == user.id, Space.status == "draft"))
        draft = result.scalars().first()
    else:
        result = await db.execute(select(Space).where(Space.id == space_id, Space.owner_user_id == user.id, Space.status == "draft"))
        draft = result.scalars().first()

    if not draft:
        raise HTTPException(status_code=404, detail="Active draft space not found or not owned by user.")
        
    command = TextSourceInput(title="Pasted Text", text=req.text)
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
        return accepted
    except Exception as e:
        await db.rollback()
        raise e

@router.delete("/sources/{source_id}")
async def delete_source(source_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    service = SourceService()
    await service.delete_source(db, user_id=user.id, space_id=None, source_id=source_id)
    return {"ok": True}

@router.post("/preview")
async def generate_preview(req: PreviewRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Space).where(Space.owner_user_id == user.id, Space.status == "draft"))
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
        select(Space).where(Space.owner_user_id == user.id, Space.status == "draft")
    )
    draft = result.scalars().first()
    if not draft:
        already_live = await db.execute(select(Space).where(Space.owner_user_id == user.id, Space.status == "live"))
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




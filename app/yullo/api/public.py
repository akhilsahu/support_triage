from functools import partial
from collections.abc import AsyncIterator, Callable
import uuid
import functools

import anyio
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel, Field
from fastapi import Query
from app.core.auth import current_user, optional_current_user
from app.yullo.services.conversations.history import authorize_session, claim_sessions, list_sessions, read_transcript, proof_hash
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.yullo.services.spaces.hierarchy import upcoming_public_child_events
from app.yullo.schemas.spaces import saved_type_label
from app.models.space import Space
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.orchestra.ai.ingestion.storage import materialize as materialize_blob
from app.orchestra.ai.knowledge.factory import build_knowledge_backend
from app.yullo.adapters.conversations import YulloConversationRepository
from app.yullo.models.appearance_asset import YulloAppearanceAsset
from app.yullo.schemas.appearance import SpacePresentationConfig, default_presentation_config
from app.yullo.schemas.inference import AuraInferenceRequest
from app.orchestra.ai.appearance_preview.asset_persistence import config_references_asset, list_source_extracted_assets
from app.yullo.services.persistence.appearance import build_deterministic_landing_content, merge_applied_sections, collect_preview_facts, get_live_appearance_preview
from app.yullo.services.persistence.appearance_images import resolve_preview_images, applied_preview
from app.yullo.services.persistence.appearance_evidence import eligible_preview_chunks
from app.yullo.services.entities.payloads import (
    entity_title,
    project_public_entity_payload,
    public_entity_summary,
)
from app.yullo.services.entities.service import public_entity_predicates
from app.orchestra.ai.inference.streaming import generate_response, prepare_response

from app.yullo.services.entities.presentation import public_booking_links as _public_booking_links, public_page_details

router = APIRouter(tags=["Aura"])




async def _require_public_space(db: AsyncSession, space_id: uuid.UUID) -> None:
    exists = await db.scalar(
        select(Space.id)
        .join(YulloSpace, YulloSpace.space_id == Space.id)
        .where(
            Space.id == space_id,
            Space.product == "yullo",
            Space.active.is_(True),
            Space.status == "live",
            YulloSpace.lifecycle_status == "live",
        )
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Space not found")

def get_aura_chat(db: AsyncSession = Depends(get_db)) -> Callable[[AuraInferenceRequest], AsyncIterator[str]]:
    conversations = YulloConversationRepository(db)
    from app.yullo.config.inference import get_chat_model_config
    cfg = get_chat_model_config()
    backend = build_knowledge_backend(cfg)
    from app.orchestra.ai.knowledge.retrieval.retrieve_chunks import (
        retrieve_evidence, expand_continuations, select_records, passage_context,
    )
    from app.orchestra.ai.knowledge.retrieval.images_retrieval import attach_source_assets
    from app.orchestra.ai.db_utils.source_loader import published_doc_id
    from app.yullo.schemas.retrieval import RetrievedContext
    from app.yullo.config.inference import get_knowledge_features, get_chat_image_config, get_event_listing_config
    from app.yullo.services.sources.service import load_chat_sources, source_images, public_source_asset
    from app.yullo.services.entities.service import get_chat_fact_evidence, get_chat_entities
    from app.orchestra.ai.prompts.yullo.composer import load_chat_profile, compose_reply_messages
    from app.yullo.services.sources.assets import hydrate_passage_assets
    from app.orchestra.ai.ui_render.source_assets import SourceAssetReferences

    from app.yullo.services.spaces.hierarchy import build_event_listing_tools
    event_config = get_event_listing_config()
    features, image_config = get_knowledge_features(), get_chat_image_config()
    references = SourceAssetReferences()
    current_sources = {}

    async def load_sources(context, *, refresh=False):
        kb_ids, sources = await load_chat_sources(db, context, refresh=refresh)
        current_sources.clear()
        current_sources.update(sources)
        return kb_ids, sources

    def format_passage(passage):
        hydrate_passage_assets(current_sources, [passage])
        return references.format_passage(passage, partial(passage_context, asset_visible=public_source_asset))

    def attach_assets(sources, query, pack):
        hydrate_passage_assets(sources, pack.passages)
        attach_source_assets(
            sources, query, pack, config=image_config,
            images_for_source=partial(source_images, config=image_config),
            doc_id_for_source=published_doc_id, asset_visible=public_source_asset,
        )
        references.collect(pack.links)
        references.bind_images(pack.images)

    def compose(profile, retrieved, entities, tool_names):
        return references.compact(compose_reply_messages(
            profile, retrieved, entities, tool_names, format_passage=format_passage,
        ))

    retrieve = partial(
        retrieve_evidence, backend=backend, load_sources=load_sources,
        load_facts=partial(get_chat_fact_evidence, db),
        attach_assets=attach_assets,
        config=features, evidence_factory=RetrievedContext,
    )
    prepare = partial(
        prepare_response, retrieve=retrieve,
        expand=partial(expand_continuations, backend, config=features, load_sources=load_sources,
                       format_passage=format_passage),
        load_profile=partial(load_chat_profile, db), load_entities=partial(get_chat_entities, db),
        compose=compose,
        gallery_limit=image_config.max_gallery_images,
        select_records=partial(select_records, config=features),
        allow_search=True, format_passage=format_passage, references=references,
        extra_tools=partial(build_event_listing_tools, db, config=event_config),
    )
    generate = partial(generate_response, prepare=prepare)
    return partial(conversations.stream_response, generate=generate, cfg=cfg)

@router.get("/paths/{public_path:path}")
async def get_public_space_path(public_path: str, db: AsyncSession = Depends(get_db)):
    """Resolve a published hierarchy without granting cross-Space content access."""
    segments = public_path.split("/")
    if len(segments) < 2 or len(segments) > 20 or any(not part for part in segments):
        raise HTTPException(404, "Space not found")
    parent_id = None
    owner_id = None
    for handle in segments:
        row = (await db.execute(select(Space, YulloSpace).join(
            YulloSpace, YulloSpace.space_id == Space.id,
        ).where(Space.slug == handle, Space.product == "yullo", Space.active.is_(True),
                Space.status == "live", YulloSpace.lifecycle_status == "live"))).first()
        if not row:
            raise HTTPException(404, "Space not found")
        space, extension = row
        if extension.parent_space_id != parent_id or (owner_id is not None and space.owner_user_id != owner_id):
            raise HTTPException(404, "Space not found")
        parent_id, owner_id = space.id, space.owner_user_id
    # Reuse the canonical child projection and its disclosure rules.
    return await get_public_space(segments[-1], db)


@router.get("/spaces/{handle}")
async def get_public_space(
    handle: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(Space, YulloSpace, YulloConfig)
        .join(YulloSpace, YulloSpace.space_id == Space.id)
        .outerjoin(YulloConfig, YulloConfig.space_id == Space.id)
        .where(
            Space.slug == handle,
            Space.product == "yullo",
            Space.active.is_(True),
            Space.status == "live",
            YulloSpace.lifecycle_status == "live",
        )
    )
    result = await db.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Space not found")
    space, yullo_space, yullo_config = row
    identity = ((yullo_config.settings or {}).get("identity") or {}) if yullo_config else {}
    try:
        presentation = (
            SpacePresentationConfig.model_validate(yullo_space.appearance_config)
            if yullo_space.appearance_config
            else default_presentation_config(yullo_space.purpose, is_subspace=yullo_space.parent_space_id is not None)
        )
    except Exception:
        presentation = default_presentation_config(yullo_space.purpose, is_subspace=yullo_space.parent_space_id is not None)
    hero_asset = None
    if presentation.hero.asset_id:
        asset = await db.scalar(
            select(YulloAppearanceAsset).where(
                YulloAppearanceAsset.id == presentation.hero.asset_id,
                YulloAppearanceAsset.space_id == space.id,
                YulloAppearanceAsset.status == "active",
            )
        )
        if asset:
            hero_asset = {
                "id": str(asset.id),
                "url": f"/api/v1/yullo/public/assets/{asset.id}",
                "altText": asset.alt_text or "",
            }
        else:
            extracted_assets = await list_source_extracted_assets(db, space_id=space.id, public_only=True)
            for ext in extracted_assets:
                if ext.id == presentation.hero.asset_id:
                    hero_asset = {
                        "id": str(ext.id),
                        "url": ext.url,
                        "altText": ext.alt_text or "",
                    }
                    break

    public_entities = list(
        (
            await db.scalars(
                select(YulloSpaceEntity)
                .where(
                    *public_entity_predicates(space.id),
                    YulloSpaceEntity.entity_type.in_(("offering", "portfolio_item", "location", "event", "action")),
                )
                .order_by(YulloSpaceEntity.sort_order.asc(), YulloSpaceEntity.id.asc())
            )
        ).all()
    )
    landing_content = build_deterministic_landing_content(
        [public_entity_summary(entity) for entity in public_entities]
    )
    landing_content = merge_applied_sections(
        landing_content,
        yullo_config.settings if yullo_config else {},
        {str(entity.id) for entity in public_entities},
        {fact["id"] for fact in await collect_preview_facts(db, space.id)},
        await eligible_preview_chunks(db, space_id=space.id, contents=[
            applied_preview(yullo_config.settings if yullo_config else {}),
        ]),
    )
    landing_content = await resolve_preview_images(db, space_id=space.id, content=landing_content, public=True)
    section_types = {section.type.value for section in landing_content.sections}
    prompt_starters = identity.get("prompt_starters") or [
        prompt
        for section_type, prompt in (
            ("services", "What do you offer?"),
            ("portfolio", "Show me your work"),
            ("location", "Where are you located?"),
            ("featured", "What is happening next?"),
        )
        if section_type in section_types
    ]

    page = public_page_details(public_entities, space_type=yullo_space.space_type, space_name=space.display_name, is_subspace=yullo_space.parent_space_id is not None)
    page["pageDetails"]["typeLabel"] = saved_type_label(yullo_space.space_type, yullo_config.settings if yullo_config else None)
    return {
        "id": str(space.id),
        "handle": space.slug,
        "upcomingEvents": [event.model_dump(mode="json") for event in await upcoming_public_child_events(
            db, space.id, parent_slug=space.slug, is_subspace=yullo_space.parent_space_id is not None,
        )],
        "displayName": space.display_name,
        "isSubspace": yullo_space.parent_space_id is not None,
        "subspaceFields": identity.get("subspace_fields") if yullo_space.parent_space_id else None,
        "description": identity.get("description") or "",
        "avatarUrl": space.logo_url,
        "locationLabel": "",
        "promptStarters": (identity.get("prompt_starters") or []) if yullo_space.parent_space_id else prompt_starters,
        "presentationConfig": presentation.model_dump(mode="json", by_alias=True),
        "landingContent": landing_content.model_dump(mode="json", by_alias=True),
        "heroAsset": hero_asset,
        **page,
        "auraEnabled": True
    }


@router.get("/assets/{asset_id}")
async def get_public_appearance_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(YulloAppearanceAsset, Space, YulloSpace)
            .join(Space, Space.id == YulloAppearanceAsset.space_id)
            .join(YulloSpace, YulloSpace.space_id == Space.id)
            .where(
                YulloAppearanceAsset.id == asset_id,
                YulloAppearanceAsset.status == "active",
                Space.product == "yullo",
                Space.active.is_(True),
                Space.status == "live",
                YulloSpace.lifecycle_status == "live",
            )
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    asset, _space, yullo_space = row
    hero_image = config_references_asset(yullo_space.appearance_config, asset_id)
    if not hero_image:
        # Private saved editor drafts never authorize public asset access.
        content = await get_live_appearance_preview(db, user_id=_space.owner_user_id, space_id=_space.id, public=True)
        if not any(item.asset_id == str(asset_id) and item.image_url for section in content.sections for item in section.items):
            raise HTTPException(status_code=404, detail="Image not found")
    async with materialize_blob(asset.storage_key) as path:
        return FileResponse(
            path,
            media_type=asset.mime_type,
            content_disposition_type="inline",
            headers={"Cache-Control": "public, max-age=3600" if hero_image else "no-store"},
        )

@router.get("/spaces/{space_id}/entities/{entity_id}")
async def get_public_entity(
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(YulloSpaceEntity)
        .join(Space, Space.id == YulloSpaceEntity.space_id)
        .join(YulloSpace, YulloSpace.space_id == Space.id)
        .where(
            YulloSpaceEntity.id == entity_id,
            *public_entity_predicates(space_id),
            Space.product == "yullo",
            Space.active.is_(True),
            Space.status == "live",
            YulloSpace.lifecycle_status == "live",
        )
    )
    result = await db.execute(stmt)
    entity = result.scalar_one_or_none()

    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found or not public")

    return {
        "id": str(entity.id),
        "space_id": str(entity.space_id),
        "entity_type": entity.entity_type,
        "title": entity_title(entity),
        "payload_json": project_public_entity_payload(entity)
    }

@router.post("/spaces/{space_id}/aura/sessions")
async def start_aura_session(
    space_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(optional_current_user),
):
    """
    Start a new Aura session for a given space.
    """
    await _require_public_space(db, space_id)

    conversations = YulloConversationRepository(db)
    runtime_id = "default_aura" # In the future, this might be tied to a specific Aura version
    import secrets
    token = secrets.token_hex(32) if user is None else None
    session = await conversations.start(space_id, runtime_id, user_id=user.id if user else None,
                                         guest_token_hash=proof_hash(token) if token else None)
    return {"session_id": str(session.id), "guest_token": token}


class AuraBrowserProof(BaseModel):
    session_id: uuid.UUID
    token: str = Field(pattern=r'^[a-f0-9]{64}$')


class AuraClaimRequest(BaseModel):
    proofs: list[AuraBrowserProof] = Field(max_length=50)


@router.post('/spaces/{space_id}/aura/sessions/claim')
async def claim_aura_sessions(space_id: uuid.UUID, body: AuraClaimRequest, db: AsyncSession = Depends(get_db),
                              user=Depends(current_user)):
    await _require_public_space(db, space_id)
    return {'claimed': await claim_sessions(db, space_id=space_id, user_id=user.id, proofs=body.proofs)}


@router.get('/spaces/{space_id}/aura/sessions')
async def account_aura_sessions(space_id: uuid.UUID, before: uuid.UUID | None = None,
                                 limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db),
                                 user=Depends(current_user)):
    await _require_public_space(db, space_id)
    return await list_sessions(db, space_id=space_id, user_id=user.id, before=before, limit=limit)


@router.get('/spaces/{space_id}/aura/sessions/{session_id}')
async def aura_transcript(space_id: uuid.UUID, session_id: uuid.UUID, raw_request: Request,
                           before: uuid.UUID | None = None, limit: int = Query(100, ge=1, le=200),
                           db: AsyncSession = Depends(get_db), user=Depends(optional_current_user)):
    await _require_public_space(db, space_id)
    session = await authorize_session(db, space_id=space_id, session_id=session_id, user_id=user.id if user else None,
                                      guest_token=raw_request.headers.get('X-Yullo-Chat-Token'))
    return await read_transcript(db, session=session, before=before, limit=limit)


@router.post("/spaces/{space_id}/aura/sessions/{session_id}/chat")
async def stream_aura_chat(
    space_id: uuid.UUID,
    session_id: uuid.UUID,
    request: AuraInferenceRequest,
    raw_request: Request = None,
    db: AsyncSession = Depends(get_db),
    chat: Callable[[AuraInferenceRequest], AsyncIterator[str]] = Depends(get_aura_chat),
    user=Depends(optional_current_user),
):
    """
    Stream a chat completion using injected evidence preparation and shared inference.
    """
    if str(request.space_id) != str(space_id) or str(request.session_id) != str(session_id):
        raise HTTPException(status_code=400, detail="Path parameters do not match request body")
        
    if len(request.message) > 1000:
        raise HTTPException(status_code=400, detail="Message too long (max 1000 characters).")
        
    from app.yullo.config.inference import get_chat_model_config
    request.model = get_chat_model_config().llm_model
    
    if raw_request:
        from app.core.rate_limit import enforce_rate_limit
        client_ip = raw_request.client.host if raw_request.client else "unknown"
        await enforce_rate_limit(
            bucket="public_aura_chat",
            identifier=f"{space_id}_{client_ip}",
            limit=10,
            window_sec=60
        )

    await _require_public_space(db, space_id)

    guest_token = raw_request.headers.get('X-Yullo-Chat-Token') if raw_request else None
    await authorize_session(db, space_id=space_id, session_id=session_id, user_id=user.id if user else None,
                            guest_token=guest_token, allow_legacy=True)

    from app.orchestra.ai.db_utils.source_loader import resolve_space_kb_ids
    # Public callers cannot choose KBs belonging to other Spaces or drafts.
    request.kb_ids = await resolve_space_kb_ids(db, space_id, product="yullo")
    request.published_version = None

    async def event_generator():
        async for chunk in chat(request, user_id=user.id if user else None, guest_token=guest_token):
            payload = chunk.strip()
            if payload:
                yield f"data: {payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/spaces/{space_id}/aura/images/{image_id}")
async def get_public_chat_image(space_id: uuid.UUID, image_id: str, db: AsyncSession = Depends(get_db)):
    from app.orchestra.ai.knowledge.retrieval.images_retrieval import resolve_published_chunk_image
    from app.yullo.services.sources.service import source_images
    from app.yullo.config.inference import get_chat_image_config
    from app.orchestra.ai.db_utils.source_loader import published_doc_id
    from app.yullo.services.sources.service import load_chat_sources
    from app.yullo.schemas.retrieval import YulloExecutionContext
    from app.yullo.services.sources.assets import hydrate_passage_assets

    await _require_public_space(db, space_id)
    if len(image_id) != 64 or any(c not in '0123456789abcdef' for c in image_id):
        raise HTTPException(status_code=404, detail="Image unavailable")
    _, sources = await load_chat_sources(db, YulloExecutionContext(space_id=space_id, kb_ids=[]))
    image_config = get_chat_image_config()
    for source in sources.values():
        for image in source_images(source, config=image_config):
            if image['id'] == image_id:
                def prepare_metadata(metadata):
                    passage = {'meta': metadata}
                    hydrate_passage_assets(sources, [passage])
                    return passage['meta']
                from fastapi.responses import JSONResponse
                resolved = await anyio.to_thread.run_sync(functools.partial(
                    resolve_published_chunk_image,
                    str(space_id),
                    published_doc_id(source),
                    image, config=image_config, prepare_metadata=prepare_metadata,
                ))
                return JSONResponse(resolved, headers={"Cache-Control": "no-store"})
    raise HTTPException(status_code=404, detail="Image unavailable")


@router.get("/spaces/{space_id}/resources")
async def get_public_resources(space_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse
    from app.yullo.services.sources.resources import list_public_resources
    return JSONResponse(await list_public_resources(db, space_id), headers={"Cache-Control": "no-store"})


@router.get("/spaces/{space_id}/resources/{source_id}")
async def open_public_resource(space_id: uuid.UUID, source_id: uuid.UUID, version: int = Query(ge=1), db: AsyncSession = Depends(get_db)):
    from urllib.parse import quote
    from fastapi.responses import RedirectResponse, Response
    from app.yullo.services.sources.resources import get_public_resource, original_blob_key, original_url, resource_kind

    source = await get_public_resource(db, space_id, source_id, version)
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"}
    if resource_kind(source) == "link":
        return RedirectResponse(original_url(source), status_code=307, headers=headers)
    if source.item_type in ("text", "qna") and not source.source_locator:
        text = f"{source.question}\n\n{source.content or ''}" if source.item_type == "qna" else source.content or ""
        return Response(text, media_type="text/plain", headers=headers)
    key = original_blob_key(source)
    try:
        async with materialize_blob(key) as path:
            async with await anyio.open_file(path, "rb") as file:
                signature = await file.read(16)
    except FileNotFoundError:
        raise HTTPException(404, "Resource not available") from None
    media = "text/plain" if source.item_type == "text" else (
        "application/pdf" if signature.startswith(b"%PDF-") else
        "image/png" if signature.startswith(b"\x89PNG\r\n\x1a\n") else
        "image/jpeg" if signature.startswith(b"\xff\xd8\xff") else
        "image/gif" if signature.startswith((b"GIF87a", b"GIF89a")) else
        "image/webp" if signature.startswith(b"RIFF") and signature[8:12] == b"WEBP" else
        "image/avif" if signature[4:8] == b"ftyp" and signature[8:12] in (b"avif", b"avis") else
        "application/octet-stream")
    disposition = "attachment" if media == "application/octet-stream" else "inline"
    headers["Content-Disposition"] = f"{disposition}; filename*=UTF-8''{quote(source.title or 'resource', safe='')}"
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'"

    async def body():
        # Keep the storage context alive for the whole response, including remote stores.
        async with materialize_blob(key) as path:
            async with await anyio.open_file(path, "rb") as file:
                while chunk := await file.read(65536):
                    yield chunk
    return StreamingResponse(body(), media_type=media, headers=headers)

from functools import partial
from collections.abc import AsyncIterator, Callable
import uuid
import functools
from urllib.parse import urlsplit

import anyio
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.space import Space
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.orchestra.ai.config import build_config
from app.orchestra.ai.ingestion.storage import materialize as materialize_blob
from app.orchestra.ai.knowledge.factory import build_knowledge_backend
from app.yullo.adapters.conversations import YulloConversationRepository
from app.yullo.models.appearance_asset import YulloAppearanceAsset
from app.yullo.schemas.appearance import SpacePresentationConfig, default_presentation_config
from app.yullo.schemas.inference import AuraInferenceRequest
from app.orchestra.ai.appearance_preview.asset_persistence import config_references_asset, list_source_extracted_assets
from app.yullo.services.persistence.appearance import build_deterministic_landing_content, merge_applied_sections, collect_preview_facts, get_live_appearance_preview
from app.yullo.services.persistence.appearance_images import resolve_preview_images
from app.yullo.services.entities.payloads import (
    entity_title,
    project_public_entity_payload,
    public_entity_summary,
)
from app.yullo.services.entities.service import public_entity_predicates
from app.orchestra.ai.inference.streaming import generate_response, prepare_response

router = APIRouter(tags=["Aura"])


def _public_booking_links(entities: list[YulloSpaceEntity]) -> list[dict[str, str]]:
    """Project static-page links; public-Aura permission alone is insufficient."""
    links = []
    for entity in entities:
        if (entity.entity_type != "action" or not entity.is_active or not entity.is_public
                or entity.review_status not in ("owner_confirmed", "source_authoritative")
                or entity.visibility not in (None, "public")):
            continue
        payload = project_public_entity_payload(entity)
        if payload.get("kind") != "booking":
            continue
        policies = entity.field_policies or {}
        fields = policies.get("fields", policies) if isinstance(policies, dict) else None
        if not isinstance(fields, dict):
            continue
        permitted = True
        for key in ("label", "destination_url", "kind"):
            policy = fields.get(key)
            visibility = policy.get("visibility") if isinstance(policy, dict) else policy
            disclosure = policy.get("disclosureMode", policy.get("disclosure_mode")) if isinstance(policy, dict) else None
            if visibility not in (None, "public") or disclosure not in (None, "direct"):
                permitted = False
        label, url = payload.get("label"), payload.get("destination_url")
        if not permitted or not isinstance(label, str) or not label.strip() or not isinstance(url, str):
            continue
        try:
            parsed = urlsplit(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                continue
        except ValueError:
            continue
        links.append({"id": str(entity.id), "label": label.strip(), "url": url})
    return links


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
    cfg = build_config()
    backend = build_knowledge_backend(cfg)
    from app.orchestra.ai.knowledge.retrieval.retrieve_chunks import (
        retrieve_evidence, expand_continuations, select_records, passage_context,
    )
    from app.orchestra.ai.knowledge.retrieval.images_retrieval import attach_source_assets
    from app.orchestra.ai.db_utils.source_loader import published_doc_id
    from app.yullo.schemas.retrieval import RetrievedContext
    from app.yullo.config.inference import get_knowledge_features, get_chat_image_config
    from app.yullo.services.sources.service import load_chat_sources, source_images, public_source_asset
    from app.yullo.services.entities.service import get_chat_fact_evidence, get_chat_entities
    from app.orchestra.ai.prompts.yullo.composer import load_chat_profile, compose_reply_messages

    features, image_config = get_knowledge_features(), get_chat_image_config()
    format_passage = partial(passage_context, asset_visible=public_source_asset)
    load_sources = partial(load_chat_sources, db)
    retrieve = partial(
        retrieve_evidence, backend=backend, load_sources=load_sources,
        load_facts=partial(get_chat_fact_evidence, db),
        attach_assets=partial(
            attach_source_assets, config=image_config,
            images_for_source=partial(source_images, config=image_config),
            doc_id_for_source=published_doc_id, asset_visible=public_source_asset,
        ),
        config=features, evidence_factory=RetrievedContext,
    )
    prepare = partial(
        prepare_response, retrieve=retrieve,
        expand=partial(expand_continuations, backend, config=features, load_sources=load_sources,
                       format_passage=format_passage),
        load_profile=partial(load_chat_profile, db), load_entities=partial(get_chat_entities, db),
        compose=partial(compose_reply_messages, format_passage=format_passage),
        gallery_limit=image_config.max_gallery_images,
        select_records=partial(select_records, config=features),
        allow_search=True, format_passage=format_passage,
    )
    generate = partial(generate_response, prepare=prepare)
    return partial(conversations.stream_response, generate=generate, cfg=cfg)

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
            else default_presentation_config(yullo_space.purpose)
        )
    except Exception:
        presentation = default_presentation_config(yullo_space.purpose)
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

    return {
        "id": str(space.id),
        "handle": space.slug,
        "displayName": space.display_name,
        "description": identity.get("description") or "",
        "avatarUrl": space.logo_url,
        "locationLabel": "",
        "promptStarters": prompt_starters,
        "presentationConfig": presentation.model_dump(mode="json", by_alias=True),
        "landingContent": landing_content.model_dump(mode="json", by_alias=True),
        "heroAsset": hero_asset,
        "bookingLinks": _public_booking_links(public_entities),
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
    db: AsyncSession = Depends(get_db)
):
    """
    Start a new Aura session for a given space.
    """
    await _require_public_space(db, space_id)

    conversations = YulloConversationRepository(db)
    runtime_id = "default_aura" # In the future, this might be tied to a specific Aura version
    session = await conversations.start(space_id, runtime_id)
    return {"session_id": str(session.id)}


@router.post("/spaces/{space_id}/aura/sessions/{session_id}/chat")
async def stream_aura_chat(
    space_id: uuid.UUID,
    session_id: uuid.UUID,
    request: AuraInferenceRequest,
    raw_request: Request = None,
    db: AsyncSession = Depends(get_db),
    chat: Callable[[AuraInferenceRequest], AsyncIterator[str]] = Depends(get_aura_chat)
):
    """
    Stream a chat completion using injected evidence preparation and shared inference.
    """
    if str(request.space_id) != str(space_id) or str(request.session_id) != str(session_id):
        raise HTTPException(status_code=400, detail="Path parameters do not match request body")
        
    if len(request.message) > 1000:
        raise HTTPException(status_code=400, detail="Message too long (max 1000 characters).")
        
    request.model = "gpt-4o-mini"
    
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

    from app.orchestra.ai.db_utils.source_loader import resolve_space_kb_ids
    # Public callers cannot choose KBs belonging to other Spaces or drafts.
    request.kb_ids = await resolve_space_kb_ids(db, space_id, product="yullo")
    request.published_version = None

    async def event_generator():
        async for chunk in chat(request):
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
    from app.orchestra.ai.db_utils.source_loader import resolve_space_kb_ids, load_published_chat_sources
    from app.orchestra.ai.knowledge.retrieval.images_retrieval import resolve_published_chunk_image
    from app.yullo.services.sources.service import source_images
    from app.yullo.config.inference import get_chat_image_config
    from app.orchestra.ai.db_utils.source_loader import published_doc_id

    await _require_public_space(db, space_id)
    if len(image_id) != 64 or any(c not in '0123456789abcdef' for c in image_id):
        raise HTTPException(status_code=404, detail="Image unavailable")
    kb_ids = await resolve_space_kb_ids(db, space_id, product="yullo")
    sources = await load_published_chat_sources(db, space_id, kb_ids, product="yullo")
    image_config = get_chat_image_config()
    for source in sources:
        for image in source_images(source, config=image_config):
            if image['id'] == image_id:
                from fastapi.responses import JSONResponse
                resolved = await anyio.to_thread.run_sync(functools.partial(
                    resolve_published_chunk_image,
                    str(space_id),
                    published_doc_id(source),
                    image, config=image_config,
                ))
                return JSONResponse(resolved, headers={"Cache-Control": "no-store"})
    raise HTTPException(status_code=404, detail="Image unavailable")

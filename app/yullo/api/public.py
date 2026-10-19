import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.space import Space
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.orchestra.ai.core.config import build_config
from app.orchestra.ai.ingestion.storage import materialize as materialize_blob
from app.orchestra.ai.knowledge.factory import build_knowledge_backend
from app.yullo.adapters.conversations import YulloConversationRepository
from app.yullo.models.appearance_asset import YulloAppearanceAsset
from app.yullo.schemas.appearance import SpacePresentationConfig, default_presentation_config
from app.yullo.schemas.inference import AuraInferenceRequest
from app.yullo.services.appearance_assets import config_references_asset, list_source_extracted_assets
from app.yullo.services.appearance_preview import build_deterministic_landing_content, merge_applied_sections, collect_preview_facts
from app.yullo.services.inference.generative_ui import (
    entity_title,
    project_public_entity_payload,
    public_entity_predicates,
    public_entity_summary,
)
from app.yullo.services.inference.runtime import YulloAuraRuntime
from app.yullo.services.knowledge.retriever import YulloRetriever

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

def get_aura_runtime(db: AsyncSession = Depends(get_db)) -> YulloAuraRuntime:
    conversations = YulloConversationRepository(db)
    cfg = build_config()
    backend = build_knowledge_backend(cfg)
    retriever = YulloRetriever(db, backend)
    return YulloAuraRuntime(db, retriever, conversations)

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
            extracted_assets = await list_source_extracted_assets(db, space_id=space.id)
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
    if not config_references_asset(yullo_space.appearance_config, asset_id):
        raise HTTPException(status_code=404, detail="Image not found")
    async with materialize_blob(asset.storage_key) as path:
        return FileResponse(
            path,
            media_type=asset.mime_type,
            content_disposition_type="inline",
            headers={"Cache-Control": "public, max-age=3600"},
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
    runtime: YulloAuraRuntime = Depends(get_aura_runtime)
):
    """
    Stream a chat completion using the Aura runtime.
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

    async def event_generator():
        async for chunk in runtime.stream_response(request):
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

import uuid
import logging
import re
from typing import Optional, Dict, Any
from fastapi import HTTPException
from sqlalchemy import select, and_, update, case, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_config import YulloConfig
from app.models.yullo_space_entity import YulloSpaceEntity
from app.models.yullo_category_suggestion import YulloCategorySuggestion
from app.yullo.schemas.forms.identity import (
    IdentityFormResponse,
    IdentityFormUpdate,
    HandleCheckResponse,
    HandleChangeRequest,
    SpacePurpose, validate_logo_url
)
from app.yullo.services.spaces.handles import validate_handle_format_and_availability
from app.yullo.services.spaces.creation import create_or_resolve_yullo_space
from app.yullo.schemas.spaces import SpaceType, QuickSpaceContext, space_description_limit
from app.yullo.services.spaces.hierarchy import lock_hierarchy, require_no_children, require_parent
from app.yullo.services.entities.service import create_owner_entity, update_entity
from app.yullo.services.entities.contracts import EntityCommand, EntityPatch
from app.yullo.services.persistence.common import finalize_space_mutation
from app.yullo.schemas.spaces import resolve_space_type, saved_type_label
from app.yullo.services.persistence.appearance import _parse_config

WEBSITE_IDENTITY_KEY = "space-website"

CANONICAL_PURPOSES = ("person", "creator", "business", "organization")
PURPOSE_MAP = {
    "personal": "person",
    "work": "creator"
}

def normalize_purpose(raw_purpose: Optional[str]) -> str:
    """
    Normalizes purpose string to canonical SpacePurpose value.
    Maps legacy 'personal' -> 'person', 'work' -> 'creator'.
    Raises HTTPException 422 for invalid/unknown purposes.
    """
    if not raw_purpose:
        return "business"
    p = raw_purpose.strip().lower()
    p = PURPOSE_MAP.get(p, p)
    if p not in CANONICAL_PURPOSES:
        raise HTTPException(status_code=422, detail=f"Invalid purpose '{raw_purpose}'. Must be one of: {', '.join(CANONICAL_PURPOSES)}")
    return p


def _validate_description(description, parent_space_id):
    limit = space_description_limit(parent_space_id)
    if description is not None and len(description) > limit:
        raise HTTPException(422, f"Description must be at most {limit} characters")


async def _require_space_owner(db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID) -> None:
    stmt = select(Space).where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo")
    space = await db.scalar(stmt)
    if not space:
        raise HTTPException(status_code=403, detail="Not authorized or Yullo space not found")
        
async def get_identity(db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID) -> IdentityFormResponse:
    await _require_space_owner(db, space_id, user_id)
    
    space = await db.scalar(select(Space).where(Space.id == space_id))
    yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == space_id))
    yullo_config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == space_id))
    
    if not yullo_space:
        raise HTTPException(status_code=404, detail="YulloSpace not found")
        
    settings = yullo_config.settings if yullo_config and yullo_config.settings else {}
    identity_settings = settings.get("identity", {})
    
    # Fetch website contact channel entity if it exists
    website = None
    website_entity = await db.scalar(
        select(YulloSpaceEntity).where(
            YulloSpaceEntity.space_id == space_id,
            YulloSpaceEntity.entity_type == "contact_channel",
            YulloSpaceEntity.identity_key == WEBSITE_IDENTITY_KEY,
            YulloSpaceEntity.is_active == True
        )
    )
    if website_entity:
        website = website_entity.payload_json.get("value")
    
    if not website:
        if identity_settings.get("website"):
            website = identity_settings.get("website")
        # NOTE: We no longer auto-derive the website from URL knowledge sources.
        # The public website must be explicitly set by the owner through
        # the identity settings UI. Knowledge source URLs are for Aura's
        # context only, not for public display.

    description = identity_settings.get("description")
    if not description:
        description = getattr(space, "description", None)

    expected_revision = yullo_space.context_version
    safe_purpose = normalize_purpose(yullo_space.purpose)
    
    # Read category with temporary read compatibility for legacy 'subtype'
    category_val = identity_settings.get("category") or identity_settings.get("subtype")
    
    event_context = None
    if yullo_space.space_type == "event" and yullo_space.parent_space_id:
        from app.yullo.services.spaces.quick_context import read_saved_event_context
        event_context = await read_saved_event_context(db, space_id)

    return IdentityFormResponse(
        subspace_fields=identity_settings.get("subspace_fields") if yullo_space.parent_space_id else None,
        presentation_config=_parse_config(yullo_space),
        event_context=event_context,
        parent_space_id=yullo_space.parent_space_id,
        space_id=space.id,
        purpose=SpacePurpose(safe_purpose),
        display_name=space.display_name,
        slug=space.slug,
        logo_url=space.logo_url,
        description=description,
        description_source=identity_settings.get("description_source"),
        description_prompt_version=identity_settings.get("description_prompt_version"),
        description_input_fingerprint=identity_settings.get("description_input_fingerprint"),
        category=category_val,
        type_label=saved_type_label(yullo_space.space_type, yullo_config.settings if yullo_config else None) if yullo_space.parent_space_id else None,
        category_source=identity_settings.get("category_source"),
        presence=identity_settings.get("presence"),
        website=website,
        revision=expected_revision,
        status=yullo_space.lifecycle_status
    )

async def update_identity(db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID, data: IdentityFormUpdate) -> IdentityFormResponse:
    await _require_space_owner(db, space_id, user_id)
    
    # Lock Space and YulloSpace for pessimistic concurrency control
    space = await db.scalar(select(Space).where(Space.id == space_id).with_for_update())
    yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == space_id).with_for_update())
    yullo_config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == space_id).with_for_update())
    
    if yullo_space.context_version != data.expected_revision:
        raise HTTPException(status_code=409, detail="Stale revision")
        
    _validate_description(data.description, yullo_space.parent_space_id)
    if data.subspace_fields is not None and yullo_space.parent_space_id is None:
        raise HTTPException(422, "Additional details are available for subspaces")

    # Update Space fields (display_name, logo_url)
    if data.display_name is not None:
        trimmed_name = data.display_name.strip()
        if not trimmed_name or len(trimmed_name) > 200:
            raise HTTPException(status_code=422, detail="display_name must be non-empty and max 200 characters")
        space.display_name = trimmed_name
        
    if data.logo_url is not None:
        try:
            space.logo_url = validate_logo_url(data.logo_url)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        
    # Update YulloSpace fields (purpose)
    if data.purpose is not None:
        yullo_space.purpose = normalize_purpose(data.purpose.value)
        space.purpose = yullo_space.purpose
        
    # Update YulloConfig settings.identity
    if not yullo_config:
        yullo_config = YulloConfig(space_id=space_id, settings={})
        db.add(yullo_config)
    
    settings = dict(yullo_config.settings) if yullo_config.settings else {}
    identity_settings = dict(settings.get("identity", {}))
    
    if data.description is not None:
        identity_settings["description"] = data.description
        if data.description_source is not None:
            identity_settings["description_source"] = data.description_source
        elif "description_source" not in identity_settings:
            identity_settings["description_source"] = "owner"
            
    if data.description_prompt_version is not None:
        identity_settings["description_prompt_version"] = data.description_prompt_version
    if data.description_input_fingerprint is not None:
        identity_settings["description_input_fingerprint"] = data.description_input_fingerprint
        
    if data.category is not None:
        identity_settings["category"] = data.category.strip() if data.category else None
        if data.category_source is not None:
            identity_settings["category_source"] = data.category_source
        elif data.category and data.category.strip():
            identity_settings["category_source"] = "owner"
        # Record category usage in the DB suggestions store
        if data.category and data.category.strip():
            await record_category_usage(db, data.category.strip(), space.purpose)
        # Remove legacy subtype key on new writes
        identity_settings.pop("subtype", None)

    # Ensure category is populated if blank
    if not identity_settings.get("category") or not str(identity_settings.get("category")).strip():
        from app.orchestra.ai.data_generation.identity_generate import suggest_about
        gen_res = await suggest_about(db, user_id=user_id, space_id=space_id)
        suggested_cat = gen_res.get("category")
        if suggested_cat and suggested_cat.strip():
            identity_settings["category"] = suggested_cat.strip()
            identity_settings["category_source"] = "aura"
        else:
            fallback_map = {
                "person": "Personal space",
                "creator": "Creator portfolio",
                "business": "Business & brand space",
                "organization": "Community organization"
            }
            identity_settings["category"] = fallback_map.get(space.purpose or "business", "Business & brand space")
            identity_settings["category_source"] = "aura"
        
    if data.presence is not None:
        identity_settings["presence"] = data.presence.value if data.presence else None
        
    if data.subspace_fields is not None:
        identity_settings["subspace_fields"] = data.subspace_fields.model_dump(mode="json")
    settings["identity"] = identity_settings
    yullo_config.settings = settings
    
    # Update Website Contact Channel
    if data.website is not None:
        website_val = data.website.strip()
        if website_val != "":
            if not website_val.startswith(("http://", "https://")):
                if re.match(r'^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+', website_val) or website_val.startswith("localhost"):
                    website_val = f"https://{website_val}"
                else:
                    raise HTTPException(status_code=422, detail="website must be a valid HTTP or HTTPS URL")
            
        website_entity = await db.scalar(
            select(YulloSpaceEntity).where(
                YulloSpaceEntity.space_id == space_id,
                YulloSpaceEntity.entity_type == "contact_channel",
                YulloSpaceEntity.identity_key == WEBSITE_IDENTITY_KEY
            ).with_for_update()
        )
        
        if website_val == "":
            if website_entity and website_entity.is_active:
                website_entity.is_active = False
                website_entity.revision += 1
        else:
            payload = {
                "label": "Website",
                "channel": "website",
                "value": website_val
            }
            if website_entity:
                await update_entity(db, user_id=user_id, space_id=space_id, entity_id=website_entity.id, patch=EntityPatch(payload_json=payload, is_active=True, is_public=True))
            else:
                await create_owner_entity(db, user_id=user_id, space_id=space_id, command=EntityCommand(
                    identity_key=WEBSITE_IDENTITY_KEY,
                    entity_type="contact_channel",
                    payload_json=payload,
                    is_public=True
                ))

    await db.flush()
    # Call finalizer which locks Space and advances context_version
    await finalize_space_mutation(db, user_id=user_id, space_id=space_id, public_content_changed=True, operation_key=f"identity.update:{yullo_space.context_version}")
    
    return await get_identity(db, space_id, user_id)

async def check_handle(db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID, handle: str) -> HandleCheckResponse:
    await _require_space_owner(db, space_id, user_id)
    res = await validate_handle_format_and_availability(db, handle, user_id)
    return HandleCheckResponse(valid=res["valid"], reason=res["reason"])

async def change_handle(db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID, data: HandleChangeRequest) -> IdentityFormResponse:
    await _require_space_owner(db, space_id, user_id)
    
    # Lock Space and YulloSpace
    space = await db.scalar(select(Space).where(Space.id == space_id).with_for_update())
    yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == space_id).with_for_update())
    
    if yullo_space.context_version != data.expected_revision:
        raise HTTPException(status_code=409, detail="Stale revision")
        
    requested_handle = data.handle.strip().lower()
    res = await validate_handle_format_and_availability(db, requested_handle, user_id)
    if not res["valid"]:
        # Validation or availability check failed -> retain old slug
        raise HTTPException(status_code=422, detail=res["reason"])
        
    space.slug = requested_handle
    
    await db.flush()
    await finalize_space_mutation(db, user_id=user_id, space_id=space_id, public_content_changed=True, operation_key=f"handle.change:{yullo_space.context_version}")
    
    return await get_identity(db, space_id, user_id)

async def create_space(
    db: AsyncSession,
    user_id: uuid.UUID,
    display_name: str = "Unnamed Space",
    slug: Optional[str] = None,
    purpose: str = "business",
    description: Optional[str] = None,
    logo_url: Optional[str] = None,
    category: Optional[str] = None,
    presence: Optional[str] = None,
    website: Optional[str] = None,
    parent_space_id: Optional[uuid.UUID] = None,
    space_type: SpaceType = SpaceType.space,
    type_label: Optional[str] = None,
    quick_context: QuickSpaceContext | None = None,
) -> IdentityFormResponse:
    if type_label is not None and parent_space_id is None:
        raise HTTPException(422, "Custom types are available for subspaces")
    try:
        space_type, type_label = resolve_space_type(space_type, type_label)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    if not display_name or not display_name.strip():
        display_name = "Unnamed Space"
    display_name = display_name.strip()
    if len(display_name) > 200:
        raise HTTPException(status_code=422, detail="display_name max length is 200")

    try:
        logo_url = validate_logo_url(logo_url)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    _validate_description(description, parent_space_id)
    canonical_p = normalize_purpose(purpose)
    if quick_context is not None and parent_space_id is None:
        raise HTTPException(422, "Quick context requires a parent Space")
    quick_input = None
    if quick_context is not None:
        from app.yullo.services.sources.service import SourceService
        from app.yullo.services.sources.contracts import TextSourceInput
        from app.yullo.services.spaces.quick_context import context_text
        quick_input = TextSourceInput(title="Saved Space details",
            text=context_text(display_name, type_label, description, quick_context))

    if not slug or not slug.strip():
        base_slug = re.sub(r'[^a-z0-9]+', '-', display_name.lower()).strip('-')
        if len(base_slug) < 3:
            base_slug = f"space-{uuid.uuid4().hex[:6]}"
        slug = base_slug

    slug = slug.strip().lower()

    if parent_space_id is not None:
        await lock_hierarchy(db, user_id)
        await require_parent(db, user_id, parent_space_id)
        if quick_context and quick_context.copied_company_revision:
            parent_identity = await get_identity(db, parent_space_id, user_id)
            if parent_identity.revision != quick_context.copied_company_revision:
                raise HTTPException(409, "Company details changed. Fill from company again.")
        existing = (await db.execute(select(Space, YulloSpace).join(
            YulloSpace, YulloSpace.space_id == Space.id,
        ).where(Space.product == "yullo", Space.slug == slug, Space.owner_user_id == user_id))).first()
        # A stable client-generated handle makes a lost creation response retryable.
        if existing and existing[0].current_step == "managed":
            space, config = existing
            saved_config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == space.id))
            if saved_type_label(config.space_type, saved_config.settings if saved_config else None) != type_label:
                raise HTTPException(409, "This Space was already saved with another type. Open it to edit its details.")
            if config.parent_space_id != parent_space_id or space.display_name != display_name or config.space_type != space_type or (space.logo_url or "") != (logo_url or ""):
                raise HTTPException(status_code=409, detail="Space already exists with different details")
            if quick_input is not None:
                from app.models.knowledge_base import KnowledgeBaseItem
                saved_hash = await db.scalar(select(KnowledgeBaseItem.content_hash).where(
                    KnowledgeBaseItem.space_id == space.id,
                    KnowledgeBaseItem.creation_key == str(uuid.uuid5(space.id, "quick-space-context")),
                ))
                if saved_hash != SourceService._compute_request_hash(quick_input):
                    raise HTTPException(409, "This Space was already saved. Open it to edit the details.")
            return await get_identity(db, space.id, user_id)
    
    avail = await validate_handle_format_and_availability(db, slug, user_id)
    if not avail["valid"]:
        slug = f"{slug[:40]}-{uuid.uuid4().hex[:6]}"
    
    created = await create_or_resolve_yullo_space(
        db,
        owner_user_id=user_id,
        slug=slug,
        purpose=canonical_p,
        title=display_name,
        parent_space_id=parent_space_id,
        space_type=space_type,
    )

    yullo_config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == created.space.id))
    if not yullo_config:
        yullo_config = YulloConfig(space_id=created.space.id, settings={})
        db.add(yullo_config)
        
    if logo_url:
        created.space.logo_url = logo_url

    settings = dict(yullo_config.settings) if yullo_config.settings else {}
    identity_settings = dict(settings.get("identity", {}))
    if parent_space_id is not None:
        identity_settings["type_label"] = type_label
    if description:
        identity_settings["description"] = description
        identity_settings["description_source"] = "owner"
    if category and category.strip():
        identity_settings["category"] = category.strip()
        identity_settings["category_source"] = "owner"
        await record_category_usage(db, category.strip(), canonical_p)
    else:
        from app.orchestra.ai.data_generation.identity_generate import suggest_about
        gen_res = await suggest_about(db, user_id=user_id, space_id=created.space.id)
        suggested_cat = gen_res.get("category")
        if suggested_cat and suggested_cat.strip():
            identity_settings["category"] = suggested_cat.strip()
            identity_settings["category_source"] = "aura"
        else:
            fallback_map = {
                "person": "Personal space",
                "creator": "Creator portfolio",
                "business": "Business & brand space",
                "organization": "Community organization"
            }
            identity_settings["category"] = fallback_map.get(canonical_p, "Business & brand space")
            identity_settings["category_source"] = "aura"

    if presence: identity_settings["presence"] = presence
    if quick_context is not None:
        identity_settings["subspace_fields"] = quick_context.subspace_fields.model_dump(mode="json")
    settings["identity"] = identity_settings
    yullo_config.settings = settings
    
    if website and website.strip():
        website_val = website.strip()
        if not website_val.startswith(("http://", "https://")):
            if re.match(r'^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+', website_val) or website_val.startswith("localhost"):
                website_val = f"https://{website_val}"
            else:
                raise HTTPException(status_code=422, detail="website must be a valid HTTP or HTTPS URL")
        payload = {"label": "Website", "channel": "website", "value": website_val}
        await create_owner_entity(db, user_id=user_id, space_id=created.space.id, command=EntityCommand(
            identity_key=WEBSITE_IDENTITY_KEY,
            entity_type="contact_channel",
            payload_json=payload,
            is_public=True
        ))

    if quick_context is not None and SpaceType(space_type) == SpaceType.event:
        from app.yullo.services.spaces.quick_context import save_event_records
        await save_event_records(db, user_id=user_id, space_id=created.space.id, name=display_name, context=quick_context)

    if quick_context is not None:
        accepted = await SourceService().accept_source(db, user_id=user_id, space_id=created.space.id,
            command=quick_input,
            idempotency_key=uuid.uuid5(created.space.id, "quick-space-context"))
        if quick_context.copied_company_revision:
            from app.models.knowledge_base import KnowledgeBaseItem
            item = await db.scalar(select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == accepted.item_id, KnowledgeBaseItem.space_id == created.space.id))
            item.source_metadata = {**(item.source_metadata or {}), "copied_company": {
                "space_id": str(parent_space_id), "revision": quick_context.copied_company_revision,
            }}
        # SourceService records the durable ingestion outbox in this transaction.
    await db.commit()
    if quick_context is not None:
        from app.orchestra.ai.ingestion.jobs import get_job_runner
        try:
            get_job_runner().enqueue("ingest_knowledge_item", job_id=str(accepted.job_id))
        except Exception:
            logging.getLogger(__name__).warning("yullo.quick_context.dispatch_failed", extra={"space_id": str(created.space.id), "job_id": str(accepted.job_id)})
    return await get_identity(db, created.space.id, user_id)


async def delete_or_archive_space(
    db: AsyncSession,
    space_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str = "archive"
) -> Dict[str, Any]:
    """
    Archives or permanently deletes a Yullo space owned by the user.
    - 'archive': sets status='archived' and active=False, hiding from Home dashboard while preserving data.
    - 'delete': permanently removes the Space and cascading rows from the database.
    """
    await lock_hierarchy(db, user_id)
    stmt = select(Space).where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo")
    space = await db.scalar(stmt)
    if not space:
        raise HTTPException(status_code=404, detail="Yullo space not found or not authorized")

    await require_no_children(db, space_id)

    if action == "delete":
        await db.delete(space)
        await db.commit()
        return {"status": "ok", "action": "delete", "space_id": str(space_id)}
    elif action == "archive":
        from app.yullo.services.spaces.beacon import pause_branch_beacons
        await pause_branch_beacons(db, space_id)
        space.status = "archived"
        space.active = False
        await db.commit()
        return {"status": "ok", "action": "archive", "space_id": str(space_id)}
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action '{action}'. Must be 'archive' or 'delete'.")


async def record_category_usage(
    db: AsyncSession,
    category_name: str,
    purpose: Optional[str] = None
) -> None:
    """Records category usage and persists new user-defined categories to the suggestions store."""
    trimmed = category_name.strip()
    if not trimmed or len(trimmed) > 100:
        return
    existing = await db.scalar(
        select(YulloCategorySuggestion).where(func.lower(YulloCategorySuggestion.name) == trimmed.lower())
    )
    if existing:
        existing.usage_count += 1
    else:
        new_cat = YulloCategorySuggestion(
            id=uuid.uuid4(),
            name=trimmed,
            purpose=purpose.lower() if purpose else None,
            is_popular=False,
            usage_count=1
        )
        db.add(new_cat)


async def list_category_suggestions(
    db: AsyncSession,
    query: Optional[str] = None,
    purpose: Optional[str] = None,
    limit: int = 30
) -> list[YulloCategorySuggestion]:
    """
    Retrieves category suggestions from the DB store.
    Supports filtering by purpose and query, ordering by exact/purpose match, popularity, and usage count.
    """
    stmt = select(YulloCategorySuggestion)
    
    if query and query.strip():
        q_clean = query.strip()
        stmt = stmt.where(YulloCategorySuggestion.name.ilike(f"%{q_clean}%"))
    
    order_clauses = []
    if query and query.strip():
        order_clauses.append(
            case((func.lower(YulloCategorySuggestion.name) == query.strip().lower(), 0), else_=1)
        )
    if purpose and purpose.strip():
        order_clauses.append(
            case((YulloCategorySuggestion.purpose == purpose.strip().lower(), 0), else_=1)
        )
    order_clauses.extend([
        YulloCategorySuggestion.is_popular.desc(),
        YulloCategorySuggestion.usage_count.desc(),
        YulloCategorySuggestion.name.asc()
    ])
    
    stmt = stmt.order_by(*order_clauses).limit(limit)
    res = await db.scalars(stmt)
    return list(res.all())





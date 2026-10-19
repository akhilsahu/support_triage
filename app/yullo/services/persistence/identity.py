import uuid
import re
from typing import Optional, Dict, Any
from fastapi import HTTPException
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_config import YulloConfig
from app.models.yullo_space_entity import YulloSpaceEntity
from app.yullo.schemas.forms.identity import (
    IdentityFormResponse,
    IdentityFormUpdate,
    HandleCheckResponse,
    HandleChangeRequest,
    SpacePurpose
)
from app.yullo.services.spaces.handles import validate_handle_format_and_availability
from app.yullo.services.spaces.creation import create_or_resolve_yullo_space
from app.yullo.services.entities.service import create_owner_entity, update_entity
from app.yullo.services.entities.contracts import EntityCommand, EntityPatch
from app.yullo.services.persistence.common import finalize_space_mutation

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
    
    return IdentityFormResponse(
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
        
    # Update Space fields (display_name, logo_url)
    if data.display_name is not None:
        trimmed_name = data.display_name.strip()
        if not trimmed_name or len(trimmed_name) > 200:
            raise HTTPException(status_code=422, detail="display_name must be non-empty and max 200 characters")
        space.display_name = trimmed_name
        
    if data.logo_url is not None:
        space.logo_url = data.logo_url
        
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
        # Remove legacy subtype key on new writes
        identity_settings.pop("subtype", None)

    # Ensure category is populated if blank
    if not identity_settings.get("category") or not str(identity_settings.get("category")).strip():
        from app.yullo.services.about_generation import suggest_about
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
        
    settings["identity"] = identity_settings
    yullo_config.settings = settings
    
    # Update Website Contact Channel
    if data.website is not None:
        website_val = data.website.strip()
        if website_val != "" and not website_val.startswith(("http://", "https://")):
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
    category: Optional[str] = None,
    presence: Optional[str] = None,
    website: Optional[str] = None
) -> IdentityFormResponse:
    if not display_name or not display_name.strip():
        display_name = "Unnamed Space"
    display_name = display_name.strip()
    if len(display_name) > 200:
        raise HTTPException(status_code=422, detail="display_name max length is 200")

    canonical_p = normalize_purpose(purpose)

    if not slug or not slug.strip():
        base_slug = re.sub(r'[^a-z0-9]+', '-', display_name.lower()).strip('-')
        if len(base_slug) < 3:
            base_slug = f"space-{uuid.uuid4().hex[:6]}"
        slug = base_slug

    slug = slug.strip().lower()
    
    avail = await validate_handle_format_and_availability(db, slug, user_id)
    if not avail["valid"]:
        slug = f"{slug[:40]}-{uuid.uuid4().hex[:6]}"
    
    created = await create_or_resolve_yullo_space(
        db,
        owner_user_id=user_id,
        slug=slug,
        purpose=canonical_p,
        title=display_name
    )

    yullo_config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == created.space.id))
    if not yullo_config:
        yullo_config = YulloConfig(space_id=created.space.id, settings={})
        db.add(yullo_config)
        
    settings = dict(yullo_config.settings) if yullo_config.settings else {}
    identity_settings = dict(settings.get("identity", {}))
    if description: identity_settings["description"] = description
    if category and category.strip():
        identity_settings["category"] = category.strip()
        identity_settings["category_source"] = "owner"
    else:
        from app.yullo.services.about_generation import suggest_about
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
    settings["identity"] = identity_settings
    yullo_config.settings = settings
    
    if website and website.strip():
        website_val = website.strip()
        payload = {"label": "Website", "channel": "website", "value": website_val}
        await create_owner_entity(db, user_id=user_id, space_id=created.space.id, command=EntityCommand(
            identity_key=WEBSITE_IDENTITY_KEY,
            entity_type="contact_channel",
            payload_json=payload,
            is_public=True
        ))

    await db.commit()
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
    stmt = select(Space).where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo")
    space = await db.scalar(stmt)
    if not space:
        raise HTTPException(status_code=404, detail="Yullo space not found or not authorized")

    if action == "delete":
        await db.delete(space)
        await db.commit()
        return {"status": "ok", "action": "delete", "space_id": str(space_id)}
    elif action == "archive":
        space.status = "archived"
        space.active = False
        await db.commit()
        return {"status": "ok", "action": "archive", "space_id": str(space_id)}
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action '{action}'. Must be 'archive' or 'delete'.")




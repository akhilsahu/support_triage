import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import current_user
from app.models.user import User

from app.yullo.schemas.forms.identity import (
    IdentityFormResponse,
    IdentityFormUpdate,
    HandleCheckRequest,
    HandleCheckResponse,
    HandleChangeRequest,
    SpaceCreateRequest,
    ToggleLiveRequest,
    CategorySuggestionsResponse,
    CategorySuggestionItem
)
from app.yullo.services.persistence.identity import (
    get_identity,
    update_identity,
    check_handle,
    change_handle,
    create_space,
    delete_or_archive_space,
    list_category_suggestions
)
from app.yullo.services.spaces.publication import publish_space, unpublish_space
from app.yullo.schemas.spaces import HierarchyPatch, HierarchySpace, SpaceType, QuickDescriptionRequest, QuickDescriptionResponse
from app.yullo.services.spaces.hierarchy import require_parent
from app.yullo.services.spaces.quick_context import suggest_description
from app.yullo.services.spaces.hierarchy import read_hierarchy, update_hierarchy

router = APIRouter(prefix="/yullo/spaces", tags=["yullo-forms"])


@router.post("/{space_id}/subspace-description", response_model=QuickDescriptionResponse)
async def suggest_child_description(space_id: uuid.UUID, data: QuickDescriptionRequest, response: Response,
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await require_parent(db, user.id, space_id)
    response.headers["Cache-Control"] = "no-store"
    return await suggest_description(data)


@router.get("/hierarchy", response_model=list[HierarchySpace])
async def get_space_hierarchy(
    response: Response,
    details_for: uuid.UUID | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return await read_hierarchy(db, user.id, details_for=details_for)


@router.patch("/{space_id}/hierarchy", response_model=HierarchySpace)
async def patch_space_hierarchy(
    space_id: uuid.UUID,
    data: HierarchyPatch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_hierarchy(db, user.id, space_id, data)


@router.get("/categories/suggestions", response_model=CategorySuggestionsResponse)
async def get_category_suggestions_endpoint(
    query: Optional[str] = None,
    purpose: Optional[str] = None,
    limit: int = 30,
    db: AsyncSession = Depends(get_db)
):
    """Returns database-backed category suggestions filtered by purpose and search query."""
    results = await list_category_suggestions(db, query=query, purpose=purpose, limit=limit)
    return CategorySuggestionsResponse(
        items=[
            CategorySuggestionItem(
                id=item.id,
                name=item.name,
                purpose=item.purpose,
                is_popular=item.is_popular,
                usage_count=item.usage_count
            )
            for item in results
        ]
    )

@router.post("", response_model=IdentityFormResponse)
@router.post("/", response_model=IdentityFormResponse)
async def create_new_space_endpoint(
    data: SpaceCreateRequest = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    name = data.display_name if data and data.display_name else "Unnamed Space"
    slug = data.slug if data else None
    purpose = data.purpose.value if data and data.purpose else "business"
    description = data.description if data else None
    category = data.category if data else None
    presence = data.presence.value if data and data.presence else None
    website = data.website if data else None
    return await create_space(
        db,
        user.id,
        display_name=name,
        slug=slug,
        purpose=purpose,
        description=description,
        category=category,
        presence=presence,
        website=website,
        parent_space_id=data.parent_space_id if data else None,
        space_type=data.space_type if data else SpaceType.space,
        quick_context=data.quick_context if data else None,
        logo_url=data.logo_url if data else None,
    )


@router.get("/{space_id}/forms/identity", response_model=IdentityFormResponse)
async def get_identity_form(
    space_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    return await get_identity(db, space_id, user.id)

@router.put("/{space_id}/forms/identity", response_model=IdentityFormResponse)
async def update_identity_form(
    space_id: uuid.UUID,
    data: IdentityFormUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    return await update_identity(db, space_id, user.id, data)

@router.post("/{space_id}/forms/identity/check-handle", response_model=HandleCheckResponse)
async def check_handle_availability(
    space_id: uuid.UUID,
    data: HandleCheckRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    return await check_handle(db, space_id, user.id, data.handle)

@router.post("/{space_id}/forms/identity/change-handle", response_model=IdentityFormResponse)
async def perform_change_handle(
    space_id: uuid.UUID,
    data: HandleChangeRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    return await change_handle(db, space_id, user.id, data)

@router.post("/{space_id}/forms/identity/toggle-live", response_model=IdentityFormResponse)
async def toggle_space_live_status(
    space_id: uuid.UUID,
    data: ToggleLiveRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    if data.live:
        await publish_space(db, space_id=space_id, owner_user_id=user.id)
    else:
        await unpublish_space(db, space_id=space_id, owner_user_id=user.id)
    await db.commit()
    return await get_identity(db, space_id, user.id)


@router.delete("/{space_id}")
async def delete_space_endpoint(
    space_id: uuid.UUID,
    action: str = "archive",
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    return await delete_or_archive_space(db, space_id, user.id, action)



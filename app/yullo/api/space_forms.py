import uuid
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
    SpaceCreateRequest
)
from app.yullo.services.persistence.identity import (
    get_identity,
    update_identity,
    check_handle,
    change_handle,
    create_space
)

router = APIRouter(prefix="/yullo/spaces", tags=["yullo-forms"])

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
        website=website
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

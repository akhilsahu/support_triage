import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.database import get_db
from app.models.user import User
from app.yullo.services.entities.contracts import (
    BulkEntityPatch,
    EntityCommand,
    EntityPatch,
    SourceEntityDTO,
    SpaceEntityDTO,
)
from app.yullo.services.entities.service import (
    archive_entity,
    bulk_update_entities,
    confirm_entity,
    create_owner_entity,
    get_source_entities,
    get_space_entities,
    reject_entity,
    update_entity,
)

router = APIRouter(prefix="/yullo/spaces", tags=["yullo-entities"])


@router.get("/{space_id}/entities", response_model=list[SpaceEntityDTO])
async def list_entities(
    space_id: uuid.UUID,
    include_inactive: bool = True,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_space_entities(
        db, space_id=space_id, user_id=user.id, include_inactive=include_inactive
    )


@router.get(
    "/{space_id}/sources/{source_id}/entities",
    response_model=list[SourceEntityDTO],
)
async def list_source_entities(
    space_id: uuid.UUID,
    source_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_source_entities(db, space_id=space_id, source_id=source_id, user_id=user.id)


@router.post("/{space_id}/entities", response_model=SpaceEntityDTO)
async def create_new_entity(
    space_id: uuid.UUID,
    data: EntityCommand,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await create_owner_entity(db, space_id=space_id, user_id=user.id, command=data)
    await db.commit()
    return result


@router.patch("/{space_id}/entities/{entity_id}", response_model=SpaceEntityDTO)
async def edit_entity(
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    data: EntityPatch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await update_entity(
        db, space_id=space_id, entity_id=entity_id, user_id=user.id, patch=data
    )
    await db.commit()
    return result


@router.post("/{space_id}/entities/{entity_id}/confirm", response_model=SpaceEntityDTO)
async def confirm_existing_entity(
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    expected_revision: int,
    is_public: bool | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await confirm_entity(
        db,
        space_id=space_id,
        entity_id=entity_id,
        user_id=user.id,
        expected_revision=expected_revision,
        is_public=is_public,
    )
    await db.commit()
    return result


@router.post("/{space_id}/entities/{entity_id}/reject", response_model=SpaceEntityDTO)
async def reject_existing_entity(
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    expected_revision: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await reject_entity(
        db,
        space_id=space_id,
        entity_id=entity_id,
        user_id=user.id,
        expected_revision=expected_revision,
    )
    await db.commit()
    return result


@router.delete("/{space_id}/entities/{entity_id}", status_code=204)
async def archive_existing_entity(
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    await archive_entity(db, space_id=space_id, entity_id=entity_id, user_id=user.id)
    await db.commit()
    return Response(status_code=204)


@router.post("/{space_id}/entities/bulk-update", response_model=list[SpaceEntityDTO])
async def bulk_update_space_entities(
    space_id: uuid.UUID,
    data: BulkEntityPatch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    results = await bulk_update_entities(
        db, space_id=space_id, user_id=user.id, patch=data
    )
    await db.commit()
    return results

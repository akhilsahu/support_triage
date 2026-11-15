from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.database import get_db
from app.models.user import User
from app.yullo.services.sources.resources import update_resource
from app.yullo.schemas.knowledge import PublicResourceUpdate, CleanupAlertResolveRequest, FactReviewRequest, SourceFactResponse, VectorChunksResponse
from app.yullo.services.sources.cleanup_alerts import list_cleanup_alerts, resolve_cleanup_alert
from app.yullo.services.sources.fact_review import list_source_facts, review_source_fact
from app.yullo.services.sources.vector_chunks import (
    get_space_vector_chunks,
)

router = APIRouter(prefix="/yullo/spaces", tags=["yullo-knowledge-review"])


@router.get("/{space_id}/knowledge-cleanup-alerts")
async def read_cleanup_alerts(
    space_id: UUID,
    status: str = Query("pending"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_cleanup_alerts(
        db,
        user_id=user.id,
        space_id=space_id,
        status=status,
    )


@router.post("/{space_id}/knowledge-cleanup-alerts/{alert_id}/resolve")
async def resolve_cleanup_alert_route(
    space_id: UUID,
    alert_id: UUID,
    payload: CleanupAlertResolveRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await resolve_cleanup_alert(
        db,
        user_id=user.id,
        space_id=space_id,
        alert_id=alert_id,
        action=payload.action,
        fact_ids=payload.fact_ids,
        entity_ids=payload.entity_ids,
        expected_revision=payload.expected_revision,
        acknowledge_unverified=payload.acknowledge_unverified,
    )
    await db.commit()
    return result


@router.get(
    "/{space_id}/sources/{source_id}/facts",
    response_model=list[SourceFactResponse],
)
async def read_source_facts(
    space_id: UUID,
    source_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_source_facts(db, user_id=user.id, space_id=space_id, source_id=source_id)


@router.patch(
    "/{space_id}/sources/{source_id}/facts/{fact_id}",
    response_model=SourceFactResponse,
)
async def update_source_fact_review(
    space_id: UUID,
    source_id: UUID,
    fact_id: UUID,
    payload: FactReviewRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await review_source_fact(
        db,
        user_id=user.id,
        space_id=space_id,
        source_id=source_id,
        fact_id=fact_id,
        review_status=payload.review_status,
        expected_status=payload.expected_status,
    )
    await db.commit()
    return result


@router.get(
    "/{space_id}/vector-chunks",
    response_model=VectorChunksResponse,
)
async def read_space_vector_chunks(
    space_id: UUID,
    source_id: Optional[UUID] = Query(None, description="Optional source ID filter"),
    limit: int = Query(600, ge=1, le=2000, description="Max chunks to return"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve vector chunks, metadata, and extracted images from ChromaDB and Postgres for a Space.
    """
    return await get_space_vector_chunks(
        db,
        space_id=space_id,
        user_id=user.id,
        source_id=source_id,
        limit=limit,
    )


@router.patch("/{space_id}/sources/{source_id}/public-resource")
async def update_public_resource(space_id: UUID, source_id: UUID, payload: PublicResourceUpdate,
    response: Response, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await update_resource(db, user_id=user.id, space_id=space_id, source_id=source_id, data=payload)

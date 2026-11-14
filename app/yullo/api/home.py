from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import current_user
from app.models.user import User
from app.yullo.services.home.service import get_yullo_home
from app.yullo.services.home.preferences import update_home_preferences
from app.schemas.yullo_home import YulloHomeResponse, HomePreferencePatch, HomeSectionPatch
from app.yullo.schemas.nearby import NearbyOrigin, NearbyRequest, NearbyResponse
from app.yullo.services.home.nearby.repository import load_origins
from app.yullo.services.home.nearby.service import browse_nearby
from app.core.rate_limit import client_ip
from app.yullo.schemas.nearby import NearbyArea
from app.yullo.schemas.user_location import LocationObservation
from app.yullo.services.home.nearby.user_location import save_user_location

router = APIRouter(prefix="/yullo/home", tags=["yullo-home"])


@router.post("/location", response_model=NearbyArea)
async def record_user_location(
    observation: LocationObservation,
    request: Request,
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return await save_user_location(db, user.id, observation, client_ip(request), datetime.now(timezone.utc))


@router.get("/nearby/locations", response_model=list[NearbyOrigin])
async def read_nearby_locations(
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return await load_origins(db, user.id)


@router.post("/nearby", response_model=NearbyResponse)
async def read_nearby(
    request: NearbyRequest,
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    # Read-only POST keeps precise browsing coordinates out of URLs/access logs.
    response.headers["Cache-Control"] = "no-store"
    return await browse_nearby(db, user.id, request, datetime.now(timezone.utc))

@router.get("", response_model=YulloHomeResponse)
async def read_yullo_home(
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the strict, isolated Yullo Home dashboard payload.
    Bypasses standard client-side caching to ensure UI reflects fresh data upon navigation.
    """
    response.headers["Cache-Control"] = "no-store"
    
    now = datetime.now(timezone.utc)
    return await get_yullo_home(db, user, now)

@router.patch("/preferences", response_model=list[HomeSectionPatch])
async def patch_home_preferences(
    patch: HomePreferencePatch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates the logged-in user's Home section preferences.
    Returns the normalized, effective configuration.
    """
    return await update_home_preferences(db, user.id, patch)

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import current_user
from app.models.user import User
from app.yullo.services.home.service import get_yullo_home
from app.yullo.services.home.preferences import update_home_preferences
from app.schemas.yullo_home import YulloHomeResponse, HomePreferencePatch, HomeSectionPatch

router = APIRouter(prefix="/yullo/home", tags=["yullo-home"])

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

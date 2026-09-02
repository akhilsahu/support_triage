"""Resolve and enforce Data Sources feature availability."""

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
from app.models.space import PlatformSettings, Space


DISABLED_DETAIL = "Data Sources has been disabled by an administrator."


async def datasource_feature_enabled(db: AsyncSession, space: Space) -> bool:
    """Return the effective platform-and-space Data Sources capability."""
    settings = await db.scalar(select(PlatformSettings).limit(1))
    platform_enabled = (
        True
        if settings is None
        else bool(settings.datasources_platform_enabled)
    )
    return platform_enabled and space.datasources_enabled is not False


async def require_datasource_feature(
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
) -> Space:
    """Require Data Sources to be available for the current space."""
    if not await datasource_feature_enabled(db, space):
        raise HTTPException(status_code=403, detail=DISABLED_DETAIL)
    return space

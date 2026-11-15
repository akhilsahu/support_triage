import logging
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.yullo.schemas.nearby import NearbyArea, NearbyRequest, NearbyResponse
from app.yullo.services.home.nearby.ranking import rank_nearby
from app.yullo.services.home.nearby.beacons import load_beacon_cards
from app.yullo.services.home.nearby.repository import load_candidates, load_origins
from app.yullo.services.home.nearby.user_location import load_user_area

logger = logging.getLogger(__name__)


class NearbyRules(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    radius_km: float = Field(10, gt=0, le=10)
    limit: int = Field(10, gt=0, le=10)


async def browse_nearby(
    db: AsyncSession, user_id: UUID, request: NearbyRequest, now: datetime,
    *, rules: NearbyRules = NearbyRules(),
) -> NearbyResponse:
    area = NearbyArea(**request.model_dump(include=set(NearbyArea.model_fields)))
    if request.location_id:
        origin = next((item for item in await load_origins(db, user_id) if item.id == request.location_id), None)
        if origin is None:
            raise HTTPException(404, "Location not found")
        area = NearbyArea(**origin.model_dump(include=set(NearbyArea.model_fields)))
    elif not any(value is not None for value in area.model_dump().values()):
        area = await load_user_area(db, user_id, now)
    if not request.location_id and not any(value is not None for value in area.model_dump().values()):
        # Resolve the richest explicit owner location once; never guess from locale or IP.
        origins = await load_origins(db, user_id)
        origin = max(origins, key=lambda item: (
            item.latitude is not None, bool(item.city), bool(item.region), bool(item.country_code),
        ), default=None)
        if origin:
            area = NearbyArea(**origin.model_dump(include=set(NearbyArea.model_fields)))
    try:
        candidates = await load_candidates(db, now)
        items = rank_nearby(candidates, area, request, radius_km=rules.radius_km, limit=rules.limit)
    except Exception:
        logger.error("yullo_nearby_failed", extra={"user_id": str(user_id)})
        raise
    logger.info("yullo_nearby_browsed", extra={"user_id": str(user_id), "result_count": len(items), "scope": request.scope})
    beacons_available = True
    try:
        async with db.begin_nested():
            beacons = await load_beacon_cards(db, area, request, now)
    except Exception as error:
        # Optional discovery must not poison the transaction or hide organic results.
        beacons, beacons_available = [], False
        logger.error("yullo.beacon.discovery_failed", extra={"error_type": type(error).__name__})
    return NearbyResponse(items=items, beacons=beacons, beacons_available=beacons_available,
                          radius_km=rules.radius_km, limit=rules.limit)

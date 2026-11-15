from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.models.user import User
from app.yullo.config.beacon import get_beacon_rules
from app.yullo.schemas.beacon import BeaconResponse, BeaconRevision, BeaconUpdate
from app.yullo.services.spaces.beacon import beacon_table_missing, pause_beacon, read_beacon, save_beacon

router = APIRouter(prefix="/yullo/spaces", tags=["yullo-beacon"])


async def _available(operation):
    try:
        return await operation
    except ProgrammingError as error:
        if not beacon_table_missing(error):
            raise
        raise HTTPException(503, "Beacon is not available yet. Please try again later.") from None


@router.get("/{space_id}/beacon", response_model=BeaconResponse)
async def get_beacon(space_id: UUID, response: Response, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await _available(read_beacon(db, user.id, space_id))


@router.put("/{space_id}/beacon", response_model=BeaconResponse)
async def put_beacon(space_id: UUID, data: BeaconUpdate, response: Response, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    await enforce_rate_limit("yullo_beacon_save", str(user.id), get_beacon_rules().activation_limit, 3600)
    return await _available(save_beacon(db, user.id, space_id, data))


@router.post("/{space_id}/beacon/pause", response_model=BeaconResponse)
async def stop_beacon(space_id: UUID, data: BeaconRevision, response: Response, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await _available(pause_beacon(db, user.id, space_id, data.expected_revision))

import logging
from datetime import datetime, timedelta
from ipaddress import ip_address
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import case, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.yullo.models.user_location import YulloUserLocation
from app.yullo.schemas.nearby import NearbyArea
from app.yullo.schemas.user_location import LocationObservation

logger = logging.getLogger(__name__)


class LocationRules(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    max_age_hours: int = Field(24, ge=1, le=168)
    future_skew_seconds: int = Field(300, ge=0, le=600)


async def load_user_area(db: AsyncSession, user_id: UUID, now: datetime, *, rules: LocationRules = LocationRules()) -> NearbyArea:
    try:
        # A pending optional-feature migration must not break existing Home discovery.
        async with db.begin_nested():
            row = (await db.execute(select(YulloUserLocation.area).where(
                YulloUserLocation.user_id == user_id,
                YulloUserLocation.captured_at >= now - timedelta(hours=rules.max_age_hours),
                YulloUserLocation.captured_at <= now + timedelta(seconds=rules.future_skew_seconds),
            ))).scalar_one_or_none()
        return NearbyArea.model_validate(row) if row else NearbyArea()
    except (SQLAlchemyError, ValidationError):
        logger.warning("yullo_location_read_unavailable", extra={"user_id": str(user_id)})
        return NearbyArea()


async def save_user_location(
    db: AsyncSession, user_id: UUID, observation: LocationObservation,
    remote_ip: str, now: datetime, *, rules: LocationRules = LocationRules(),
) -> NearbyArea:
    if observation.captured_at and not (
        now - timedelta(hours=rules.max_age_hours) <= observation.captured_at
        <= now + timedelta(seconds=rules.future_skew_seconds)
    ):
        raise HTTPException(422, "Location capture time is out of range")
    try:
        address = str(ip_address(remote_ip))
    except ValueError:
        address = None
    area = observation.model_dump(include=set(NearbyArea.model_fields), exclude_none=True)
    captured = observation.captured_at or (now if area else None)
    statement = insert(YulloUserLocation).values(
        user_id=user_id, area=area or None, accuracy_m=observation.accuracy_m,
        source="browser" if observation.latitude is not None else "reported" if area else None,
        captured_at=captured, received_at=now if area else None,
        ip_address=address, ip_observed_at=now,
    )
    newer = YulloUserLocation.captured_at.is_(None) | (statement.excluded.captured_at >= YulloUserLocation.captured_at)
    updates = {
        key: case((newer, getattr(statement.excluded, key)), else_=getattr(YulloUserLocation, key))
        for key in ("area", "accuracy_m", "source", "captured_at", "received_at")
    } if area else {}
    newer_ip = statement.excluded.ip_observed_at >= YulloUserLocation.ip_observed_at
    updates.update({
        key: case((newer_ip, getattr(statement.excluded, key)), else_=getattr(YulloUserLocation, key))
        for key in ("ip_address", "ip_observed_at")
    })
    try:
        async with db.begin_nested():
            await db.execute(statement.on_conflict_do_update(index_elements=["user_id"], set_=updates))
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.warning("yullo_location_save_unavailable", extra={"user_id": str(user_id)})
        raise HTTPException(503, "Could not save location") from None
    logger.info("yullo_location_saved", extra={"user_id": str(user_id), "has_area": bool(area)})
    return await load_user_area(db, user_id, now, rules=rules)

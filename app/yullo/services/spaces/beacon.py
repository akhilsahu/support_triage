"""Canonical Beacon owner operations. Never reads knowledge or conversations."""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import or_, select, update
from sqlalchemy.exc import ProgrammingError

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.yullo.config.beacon import get_beacon_rules
from app.yullo.models.space_beacon import YulloSpaceBeacon
from app.yullo.schemas.beacon import BeaconResponse, BeaconSettings, BeaconUpdate
from app.yullo.schemas.nearby import NearbyArea
from app.yullo.services.home.nearby.repository import _event_time
from app.yullo.services.spaces.hierarchy import lock_hierarchy, live_branch_path

logger = logging.getLogger(__name__)


def beacon_table_missing(error):
    original = error.orig
    return (getattr(original, "sqlstate", getattr(original, "pgcode", None)) == "42P01"
            and "yullo_space_beacons" in str(original))


async def _owned(db, user_id, space_id, *, lock=False):
    if lock:
        await lock_hierarchy(db, user_id)
    statement = select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo",
    )
    if lock:
        statement = statement.with_for_update(of=Space)
    row = (await db.execute(statement)).first()
    if not row or row[1].parent_space_id is None:
        raise HTTPException(404, "Subspace not found")
    return row


async def _event_expiry(db, space_id, space_name):
    event = await db.scalar(select(YulloSpaceEntity).where(
        YulloSpaceEntity.space_id == space_id, YulloSpaceEntity.entity_type == "event",
        or_(YulloSpaceEntity.identity_key == "space-event", YulloSpaceEntity.payload_json["title"].as_string() == space_name),
        YulloSpaceEntity.is_active.is_(True),
        YulloSpaceEntity.review_status.in_(("owner_confirmed", "source_authoritative")),
    ).order_by((YulloSpaceEntity.identity_key == "space-event").desc(), YulloSpaceEntity.id).limit(1))
    payload = event.payload_json if event else {}
    return _event_time(payload.get("ends_at")) or _event_time(payload.get("starts_at"))


async def _response(db, space, extension, row, now):
    rules = get_beacon_rules()
    event_expiry = await _event_expiry(db, space.id, space.display_name) if extension.space_type == "event" else None
    eligible = bool(rules.enabled and await live_branch_path(db, space, extension)
                    and (event_expiry is None or event_expiry > now))
    latest = min(now + timedelta(days=rules.max_days), event_expiry) if event_expiry else now + timedelta(days=rules.max_days)
    response = BeaconResponse(can_activate=eligible, enabled=rules.enabled, event_expires_at=event_expiry,
        default_expires_at=min(now + timedelta(days=rules.default_days), latest), latest_expires_at=latest)
    if row:
        response.config = BeaconSettings(reach=row.reach, target_area=NearbyArea.model_validate(row.target_area),
            origin_location_entity_id=row.origin_location_entity_id, expires_at=row.expires_at)
        if row.origin_location_entity_id:
            location = await db.scalar(select(YulloSpaceEntity).where(
                YulloSpaceEntity.id == row.origin_location_entity_id, YulloSpaceEntity.space_id == space.id,
                YulloSpaceEntity.entity_type == "location", YulloSpaceEntity.is_active.is_(True),
            ))
            fields = ("latitude", "longitude") if row.reach.startswith("nearby_") else ("city", "region", "country_code") if row.reach == "city" else ("country_code",)
            response.target_changed = not location or any((location.payload_json or {}).get(key) != row.target_area.get(key) for key in fields)
        response.revision = row.revision
        response.status = "expired" if row.expires_at <= now else "paused" if row.state == "paused" else "active" if eligible else "unavailable"
    return response


async def read_beacon(db, user_id: UUID, space_id: UUID):
    space, extension = await _owned(db, user_id, space_id)
    row = await db.scalar(select(YulloSpaceBeacon).where(YulloSpaceBeacon.space_id == space_id))
    return await _response(db, space, extension, row, datetime.now(timezone.utc))


async def save_beacon(db, user_id: UUID, space_id: UUID, data: BeaconUpdate):
    space, extension = await _owned(db, user_id, space_id, lock=True)
    now = datetime.now(timezone.utc)
    if not get_beacon_rules().enabled:
        raise HTTPException(409, "Beacon is currently unavailable")
    row = await db.scalar(select(YulloSpaceBeacon).where(YulloSpaceBeacon.space_id == space_id).with_for_update())
    if data.expected_revision != (row.revision if row else 0):
        raise HTTPException(409, "Beacon changed. Refresh its settings and try again.")
    state = await _response(db, space, extension, row, now)
    if not state.can_activate:
        raise HTTPException(409, "Publish this subspace and its parent pages before activating a Beacon. Its event must not have ended.")
    config = data.config
    if config.origin_location_entity_id:
        location = await db.scalar(select(YulloSpaceEntity).where(
            YulloSpaceEntity.id == config.origin_location_entity_id,
            YulloSpaceEntity.space_id == space_id, YulloSpaceEntity.entity_type == "location",
            YulloSpaceEntity.is_active.is_(True),
            YulloSpaceEntity.review_status.in_(("owner_confirmed", "source_authoritative")),
        ))
        if not location or location.payload_json.get("is_remote"):
            raise HTTPException(422, "Choose an active physical location from this subspace")
        try:
            area = NearbyArea.model_validate({key: location.payload_json.get(key) for key in NearbyArea.model_fields})
            validated = BeaconSettings.model_validate({**config.model_dump(), "origin_location_entity_id": None, "target_area": area})
        except ValidationError:
            raise HTTPException(422, "This location needs coordinates or city/country details for the selected reach") from None
        config = config.model_copy(update={"target_area": validated.target_area})
    if not now < config.expires_at <= state.latest_expires_at:
        raise HTTPException(422, "Choose a future expiry within the allowed period and event schedule")
    values = dict(state="active", reach=config.reach,
        target_area={} if config.reach == "worldwide" else config.target_area.model_dump(exclude_none=True),
        origin_location_entity_id=None if config.reach == "worldwide" else config.origin_location_entity_id,
        expires_at=config.expires_at, updated_at=now)
    if row is None:
        row = YulloSpaceBeacon(space_id=space_id, revision=1, **values)
        db.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
        row.revision += 1
    await db.flush()
    result = await _response(db, space, extension, row, now)
    await db.commit()
    logger.info("yullo.beacon.saved", extra={"space_id": str(space_id), "revision": row.revision, "reach": row.reach})
    return result


async def pause_beacon(db, user_id: UUID, space_id: UUID, expected_revision: int):
    space, extension = await _owned(db, user_id, space_id, lock=True)
    row = await db.scalar(select(YulloSpaceBeacon).where(YulloSpaceBeacon.space_id == space_id).with_for_update())
    if expected_revision != (row.revision if row else 0):
        raise HTTPException(409, "Beacon changed. Refresh its settings and try again.")
    if row and row.state != "paused":
        row.state = "paused"
        row.revision += 1
    await db.flush()
    result = await _response(db, space, extension, row, datetime.now(timezone.utc))
    await db.commit()
    logger.info("yullo.beacon.paused", extra={"space_id": str(space_id)})
    return result


async def pause_branch_beacons(db, space_id):
    """Pause in the lifecycle transaction; republishing never revives a campaign."""
    branch = select(YulloSpace.space_id).where(YulloSpace.space_id == space_id).cte(recursive=True)
    branch = branch.union(select(YulloSpace.space_id).join(branch, YulloSpace.parent_space_id == branch.c.space_id))
    try:
        async with db.begin_nested():
            await db.execute(update(YulloSpaceBeacon).where(
                YulloSpaceBeacon.space_id.in_(select(branch.c.space_id)), YulloSpaceBeacon.state == "active",
            ).values(state="paused", revision=YulloSpaceBeacon.revision + 1, updated_at=datetime.now(timezone.utc)))
    except ProgrammingError as error:
        if not beacon_table_missing(error):
            raise
        # Optional feature cannot break existing publication before its migration is applied.
        logger.warning("yullo.beacon.migration_pending")

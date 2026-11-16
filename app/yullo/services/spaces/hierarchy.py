"""Space hierarchy and the explicitly shared public child-event listing."""
import logging
import uuid
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.models.space import Space
from app.models.user import User
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.yullo.schemas.spaces import HierarchyPatch, HierarchySpace, SpaceType, resolve_space_type, saved_type_label

logger = logging.getLogger(__name__)


async def lock_hierarchy(db: AsyncSession, user_id: uuid.UUID) -> None:
    # One owner lock serializes create, move and delete, including inverse moves.
    owner = await db.scalar(select(User.id).where(User.id == user_id).with_for_update())
    if owner is None:
        raise HTTPException(404, "Account not found")


async def require_parent(db: AsyncSession, user_id: uuid.UUID, parent_id: uuid.UUID) -> None:
    parent = await db.scalar(select(Space.id).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.id == parent_id, Space.owner_user_id == user_id,
        Space.product == "yullo", Space.active.is_(True), Space.status != "archived",
    ))
    if parent is None:
        raise HTTPException(404, "Parent Space not available")


async def mark_managed(db: AsyncSession, space_id: uuid.UUID) -> None:
    # Once a Space joins a hierarchy it is managed by ID, even after detaching.
    # Global onboarding must not select or reset either end of a private link.
    await db.execute(update(Space).where(Space.id == space_id).values(current_step="managed"))
    await db.execute(update(YulloSpace).where(YulloSpace.space_id == space_id).values(onboarding_step="managed"))


async def read_hierarchy(db: AsyncSession, user_id: uuid.UUID, *, details_for: uuid.UUID | None = None) -> list[HierarchySpace]:
    rows = (await db.execute(select(Space, YulloSpace, YulloConfig).join(
        YulloSpace, YulloSpace.space_id == Space.id,
    ).outerjoin(YulloConfig, YulloConfig.space_id == Space.id).where(Space.owner_user_id == user_id, Space.product == "yullo").order_by(
        Space.display_name, Space.id,
    ))).all()
    owned = {space.id for space, _, _ in rows}
    nodes = [HierarchySpace(
        id=space.id, name=space.display_name, slug=space.slug,
        # Do not disclose a foreign parent reference if legacy data is inconsistent.
        parent_space_id=config.parent_space_id if config.parent_space_id in owned else None,
        space_type=config.space_type, type_label=saved_type_label(config.space_type, settings.settings if settings else None), revision=config.hierarchy_revision,
        status=space.status, active=space.active,
    ) for space, config, settings in rows]
    if details_for is not None:
        if details_for not in owned:
            raise HTTPException(404, "Space not found")
        from app.models.yullo_space_entity import YulloSpaceEntity
        from app.yullo.services.spaces.quick_context import read_saved_event_context
        children = [node for node in nodes if node.parent_space_id == details_for]
        child_ids = [node.id for node in children]
        records = list((await db.scalars(select(YulloSpaceEntity).where(
            YulloSpaceEntity.space_id.in_(child_ids), YulloSpaceEntity.is_active.is_(True),
            YulloSpaceEntity.review_status.in_(("owner_confirmed", "source_authoritative")),
            YulloSpaceEntity.entity_type.in_(("event", "location")),
        ))).all()) if child_ids else []
        spaces = {space.id: space for space, _, _ in rows}
        for node in children:
            node.logo_url = spaces[node.id].logo_url
            if node.space_type != SpaceType.event:
                continue
            events = [record for record in records if record.space_id == node.id and record.entity_type == "event"]
            event = next((record for record in events if record.identity_key == "space-event"), None)
            if event is None:
                matches = [record for record in events if record.payload_json.get("title") == node.name]
                event = matches[0] if len(matches) == 1 else None
            payload = event.payload_json if event else {}
            venue = next((record for record in records if record.space_id == node.id and record.entity_type == "location"
                          and (str(record.id) == payload.get("location_entity_id") or record.identity_key == "event-venue")), None)
            saved = await read_saved_event_context(db, node.id) if not event or not venue else None
            node.starts_at = payload.get("starts_at") or (saved.starts_at.isoformat() if saved and saved.starts_at else None)
            node.location_label = ("Online / Remote" if venue.payload_json.get("is_remote") else venue.payload_json.get("address")) if venue else (
                "Online / Remote" if saved and saved.location_mode == "online" else saved.place if saved else None)
    return nodes


async def update_hierarchy(
    db: AsyncSession, user_id: uuid.UUID, space_id: uuid.UUID, patch: HierarchyPatch,
) -> HierarchySpace:
    await lock_hierarchy(db, user_id)
    nodes = {node.id: node for node in await read_hierarchy(db, user_id)}
    current = nodes.get(space_id)
    if current is None:
        raise HTTPException(404, "Space not found")
    await db.scalar(select(Space.id).where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo").with_for_update())
    config = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == space_id).with_for_update())
    if config.hierarchy_revision != patch.expected_revision:
        logger.info("yullo.hierarchy.rejected", extra={"space_id": str(space_id), "reason": "stale_revision"})
        raise HTTPException(409, "This Space changed. Refresh and try again.")

    parent_id = patch.parent_space_id if "parent_space_id" in patch.model_fields_set else config.parent_space_id
    if parent_id is not None:
        await require_parent(db, user_id, parent_id)
        if current.status == "archived" or not current.active:
            raise HTTPException(422, "Only active Spaces can be linked")
        seen = {space_id}
        cursor = parent_id
        while cursor is not None:
            if cursor in seen:
                logger.info("yullo.hierarchy.rejected", extra={"space_id": str(space_id), "reason": "cycle"})
                raise HTTPException(422, "A Space cannot be inside itself or one of its subspaces")
            seen.add(cursor)
            node = nodes.get(cursor)
            if node is None:
                raise HTTPException(404, "Parent Space not available")
            cursor = node.parent_space_id

    classification_changed = patch.space_type is not None or "type_label" in patch.model_fields_set
    space_type = config.space_type
    label = current.type_label
    if classification_changed:
        try:
            kind, label = resolve_space_type(patch.space_type or config.space_type, patch.type_label)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        space_type = kind.value
    if patch.type_label and parent_id is None:
        raise HTTPException(422, "Custom types are available for subspaces")
    label_changed = classification_changed and label != current.type_label
    if config.parent_space_id != parent_id or config.space_type != space_type or label_changed:
        if config.parent_space_id != parent_id or config.space_type != space_type:
            from app.yullo.services.spaces.beacon import pause_branch_beacons
            await pause_branch_beacons(db, space_id)
        if parent_id is not None:
            await mark_managed(db, space_id)
            await mark_managed(db, parent_id)
        config.parent_space_id = parent_id
        config.space_type = space_type
        if classification_changed:
            settings_row = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == space_id).with_for_update())
            if settings_row is None:
                raise HTTPException(409, "Complete this Space's setup before changing its type")
            settings = dict(settings_row.settings or {})
            settings["identity"] = {**(settings.get("identity") or {}), "type_label": label}
            settings_row.settings = settings
            from app.yullo.services.persistence.common import finalize_space_mutation
            await finalize_space_mutation(db, user_id=user_id, space_id=space_id,
                public_content_changed=True, operation_key="subspace.type.update")
        config.hierarchy_revision += 1
        await db.commit()
        logger.info("yullo.hierarchy.updated", extra={"space_id": str(space_id), "revision": config.hierarchy_revision})
    return current.model_copy(update={
        "parent_space_id": parent_id, "space_type": SpaceType(space_type), "type_label": label, "revision": config.hierarchy_revision,
    })


async def require_no_children(db: AsyncSession, space_id: uuid.UUID) -> None:
    child = await db.scalar(select(YulloSpace.space_id).where(YulloSpace.parent_space_id == space_id).limit(1))
    if child is not None:
        raise HTTPException(409, "Detach subspaces before archiving or deleting this Space.")


EventTimeframe = Literal["all", "upcoming", "past"]
EventWindow = Literal["today", "24_hours", "week", "month", "year"]
EventSort = Literal["date_asc", "date_desc", "created_desc"]


def _event_window_end(now, window):
    from calendar import monthrange
    from datetime import timedelta

    if window in ("24_hours", "week"):
        return now + timedelta(days=1 if window == "24_hours" else 7)
    year, month = (now.year + 1, now.month) if window == "year" else (now.year + now.month // 12, now.month % 12 + 1)
    return now.replace(year=year, month=month, day=min(now.day, monthrange(year, month)[1]))


def _event_timestamp(raw):
    from datetime import datetime

    try:
        value = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return value if value.tzinfo is not None else None
    except ValueError:
        return None


async def list_public_child_events(db, space_id, *, search="", starts_after=None, starts_before=None, limit=10, config, scan_all=False, timeframe: EventTimeframe = "all", window: EventWindow | None = None, sort_by: EventSort = "date_asc", time_zone: str = "UTC"):
    """Narrow public-listing exception: direct event children, never their sources."""
    from datetime import datetime, timezone, timedelta
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    from app.models.yullo_config import YulloConfig
    from app.yullo.services.entities.service import get_public_entities
    from app.yullo.services.entities.payloads import project_public_entity_payload

    if timeframe not in ("all", "upcoming", "past") or sort_by not in ("date_asc", "date_desc", "created_desc") or window not in (None, "today", "24_hours", "week", "month", "year"):
        raise HTTPException(422, "Invalid event listing filters")
    if window and ((timeframe == "past" and window != "today") or starts_after or starts_before):
        raise HTTPException(422, "Choose a relative window or explicit date bounds")
    try:
        zone = ZoneInfo(time_zone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "Choose a valid IANA timezone") from None
    now = datetime.now(timezone.utc)
    if window == "today":
        midnight = now.astimezone(zone).replace(hour=0, minute=0, second=0, microsecond=0)
        starts_after, starts_before = midnight.astimezone(timezone.utc), (midnight + timedelta(days=1)).astimezone(timezone.utc)
    elif window:
        starts_after = now
        starts_before = _event_window_end(now if window == "24_hours" else now.astimezone(zone), window).astimezone(timezone.utc)
    if timeframe == "past" and window != "today":
        starts_before = min(starts_before, now) if starts_before else now
    if starts_after and starts_before and starts_after > starts_before:
        raise HTTPException(422, "Date range is reversed")

    parent = (await db.execute(select(Space, YulloSpace).join(
        YulloSpace, YulloSpace.space_id == Space.id,
    ).where(Space.id == space_id, Space.product == "yullo", Space.active.is_(True),
            Space.status == "live", YulloSpace.lifecycle_status == "live"))).first()
    if not parent:
        return {"status": "unavailable", "events": []}
    parent_path = await live_branch_path(db, parent[0], parent[1])
    if not parent_path:
        return {"status": "unavailable", "events": []}
    statement = select(Space, YulloConfig).join(YulloSpace, YulloSpace.space_id == Space.id).outerjoin(
        YulloConfig, YulloConfig.space_id == Space.id,
    ).where(YulloSpace.parent_space_id == space_id, YulloSpace.space_type == "event",
            Space.owner_user_id == parent[0].owner_user_id, Space.product == "yullo",
            Space.active.is_(True), Space.status == "live", YulloSpace.lifecycle_status == "live")
    if search:
        statement = statement.where(Space.display_name.icontains(search, autoescape=True))
    statement = statement.order_by(Space.created_at.desc(), Space.id) if sort_by == "created_desc" else statement.order_by(Space.id)
    if not scan_all:
        statement = statement.limit(config.max_candidates + 1)
    rows = (await db.execute(statement)).all()
    events, undated = [], []
    created = {}
    for child, child_config in (rows if scan_all else rows[:config.max_candidates]):
        records = [record for record in await get_public_entities(db, child.id, entity_types=("event", "location"))
                   if record.disclosure_mode in (None, "direct")]
        # Match this event's title; unrelated extracted events cannot supply its dates.
        payloads = [(record, project_public_entity_payload(record, direct_only=True)) for record in records if record.entity_type == "event"]
        canonical = next((payload for record, payload in payloads if record.identity_key == "space-event"), None)
        matching = [payload for _, payload in payloads if str(payload.get("title", "")).strip().casefold() == child.display_name.strip().casefold()]
        event = canonical if canonical is not None else matching[0] if len(matching) == 1 else {}
        start = _event_timestamp(event.get("starts_at"))
        end = _event_timestamp(event.get("ends_at"))
        if end and start and end < start:
            end = None
        status = "schedule_unavailable" if start is None else "ended" if end and end <= now else "upcoming" if start > now else "ongoing" if end else "started_end_unknown"
        location = next((project_public_entity_payload(record, direct_only=True) for record in records
                         if record.entity_type == "location" and str(record.id) == event.get("location_entity_id")), {})
        identity = (child_config.settings or {}).get("identity", {}) if child_config else {}
        item = {"title": child.display_name, "url": f"{parent_path}/{child.slug}", "cover_url": child.logo_url,
                       "description": identity.get("description") or "",
                       "starts_at": start.isoformat() if start else None,
                       "ends_at": end.isoformat() if end else None, "event_status": status, "is_remote": event.get("is_remote"),
                       "location": {key: location[key] for key in ("name", "address", "map_url") if key in location} or None,
                       "registration_url": event.get("registration_url")}
        if (starts_after or starts_before or timeframe != "all") and start is None:
            undated.append(item)
            continue
        if window == "today" and start:
            # Whole-day activity includes a known multi-day event overlapping today.
            if start >= starts_before or (end <= starts_after if end else start < starts_after):
                continue
        elif start and ((starts_after and start < starts_after) or (starts_before and start > starts_before)):
            continue
        if timeframe == "upcoming" and window != "today" and status == "ended":
            continue
        if timeframe == "past" and window != "today" and start and start >= now:
            continue
        created[item["url"]] = child.created_at.timestamp() if child.created_at else 0
        events.append(item)
    if sort_by == "created_desc":
        events.sort(key=lambda item: (-created[item["url"]], item["title"]))
    else:
        direction = -1 if sort_by == "date_desc" else 1
        events.sort(key=lambda item: (direction * datetime.fromisoformat(item["starts_at"]).timestamp() if item["starts_at"] else float("inf"), item["title"]))
    result = {"status": "success", "as_of": now.isoformat(),
              "events": events[:limit], "has_more": len(events) > limit or (not scan_all and len(rows) > config.max_candidates),
              "undated_events": undated[:limit], "undated_has_more": len(undated) > limit,
              "sort_by": sort_by, "time_zone": time_zone, "starts_after": starts_after.isoformat() if starts_after else None,
              "starts_before": starts_before.isoformat() if starts_before else None,
              "date_filter_excludes_unknown_dates": bool(starts_after or starts_before or timeframe != "all")}
    logger.info("yullo.events.listed", extra={"space_id": str(space_id), "returned": len(result["events"]), "has_more": result["has_more"]})
    return result


async def upcoming_public_child_events(db, space_id, *, parent_slug, is_subspace=False):
    """Share the public listing projection between Studio and the visitor page."""
    from datetime import datetime, timezone
    from app.yullo.config.inference import get_event_listing_config
    from app.yullo.schemas.appearance import UpcomingEvent

    config = get_event_listing_config()
    if is_subspace or not config.enabled:
        return []
    # Scan all direct children so the candidate cap cannot hide an earlier event.
    result = await list_public_child_events(
        db, space_id, starts_after=datetime.now(timezone.utc), limit=3,
        config=config, scan_all=True,
    )
    return [UpcomingEvent(
        title=item["title"], url=item["url"],
        cover_url=item["cover_url"], starts_at=item["starts_at"],
        location=item["location"], is_remote=item["is_remote"],
    ) for item in result["events"]]


def build_event_listing_tools(db, context, *, config):
    """Bind scope outside model arguments and use the existing Agno Function adapter."""
    from agno.tools.function import Function
    from pydantic import AwareDatetime, BaseModel, Field, ValidationError, model_validator

    if not config.enabled:
        return []

    class Filters(BaseModel):
        search: str = Field(default="", max_length=200)
        starts_after: AwareDatetime | None = None
        starts_before: AwareDatetime | None = None
        limit: int = Field(default=10, ge=1, le=20)
        timeframe: EventTimeframe = "all"
        window: EventWindow | None = None
        sort_by: EventSort = "date_asc"
        time_zone: str = Field(default="UTC", min_length=1, max_length=64)

        @model_validator(mode="after")
        def ordered(self):
            if self.window and ((self.timeframe == "past" and self.window != "today") or self.starts_after or self.starts_before):
                raise ValueError("Choose a relative window or explicit date bounds")
            if self.starts_after and self.starts_before and self.starts_after > self.starts_before:
                raise ValueError("Date range is reversed")
            return self

    async def list_events(search: str = "", starts_after: str | None = None, starts_before: str | None = None, limit: int = 10, timeframe: EventTimeframe = "all", window: EventWindow | None = None, sort_by: EventSort = "date_asc", time_zone: str = "UTC") -> dict:
        """List this Space's published child events. General questions use all; upcoming/past use timeframe. Live controls listing availability; upcoming includes not-yet-ended events. Relative window: today/24_hours/week/month/year from the server clock. Today spans the whole date in time_zone (IANA; UTC default); other ranges use timezone-aware ISO bounds. Sort date_asc/date_desc/created_desc. Unknown schedules return separately. No private child knowledge is read."""
        try:
            filters = Filters(search=search, starts_after=starts_after, starts_before=starts_before, limit=limit, timeframe=timeframe, window=window, sort_by=sort_by, time_zone=time_zone)
        except ValidationError:
            return {"status": "invalid_filters", "message": "Use a valid date range with timezone and a limit from 1 to 20."}
        try:
            # Model tools can run after another retrieval left its transaction failed.
            # Keep this public, read-only lookup independent while reusing the same DB bind.
            bind = db.bind.engine if isinstance(db.bind, AsyncConnection) else db.bind
            if bind is None:
                raise RuntimeError("Event lookup database is not configured")
            async with AsyncSession(bind=bind, expire_on_commit=False, autoflush=False) as listing_db:
                await listing_db.execute(text("SET TRANSACTION READ ONLY"))
                return await list_public_child_events(listing_db, context.space_id, search=filters.search,
                    starts_after=filters.starts_after, starts_before=filters.starts_before,
                    limit=min(filters.limit, config.max_results), config=config, timeframe=filters.timeframe,
                    window=filters.window, sort_by=filters.sort_by, time_zone=filters.time_zone)
        except Exception as error:
            if isinstance(error, HTTPException) and error.status_code == 422:
                return {"status": "invalid_filters", "message": "Choose a valid date range, timeframe and sort order."}
            logger.warning("yullo.events.list_failed space_id=%s error_type=%s", context.space_id, type(error).__name__,
                           extra={"space_id": str(context.space_id), "error_type": type(error).__name__})
            return {"status": "unavailable", "message": "Event listings are temporarily unavailable."}

    return [Function.from_callable(list_events)]


async def live_branch_path(db, space, extension, *, ancestor_cache=None):
    """Every ancestor must be live, same-owner and Yullo; cycles fail closed."""
    parts, seen = [], set()
    cache = ancestor_cache if ancestor_cache is not None else {}
    owner_id = space.owner_user_id
    while True:
        if (space.id in seen or len(seen) >= 20 or space.owner_user_id != owner_id
                or space.product != "yullo" or not space.active or space.status != "live"
                or extension.lifecycle_status != "live"):
            return None
        seen.add(space.id)
        parts.append(space.slug)
        if extension.parent_space_id is None:
            return "/" + "/".join(reversed(parts))
        parent_id = extension.parent_space_id
        key = (owner_id, parent_id)
        if key not in cache:
            cache[key] = (await db.execute(select(Space, YulloSpace).join(
                YulloSpace, YulloSpace.space_id == Space.id,
            ).where(Space.id == parent_id, Space.owner_user_id == owner_id, Space.product == "yullo"))).first()
        row = cache[key]
        if not row:
            return None
        space, extension = row

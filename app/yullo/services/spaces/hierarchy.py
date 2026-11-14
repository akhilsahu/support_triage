"""Space hierarchy and the explicitly shared public child-event listing."""
import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.user import User
from app.models.yullo_space import YulloSpace
from app.yullo.schemas.spaces import HierarchyPatch, HierarchySpace, SpaceType

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
    rows = (await db.execute(select(Space, YulloSpace).join(
        YulloSpace, YulloSpace.space_id == Space.id,
    ).where(Space.owner_user_id == user_id, Space.product == "yullo").order_by(
        Space.display_name, Space.id,
    ))).all()
    owned = {space.id for space, _ in rows}
    nodes = [HierarchySpace(
        id=space.id, name=space.display_name, slug=space.slug,
        # Do not disclose a foreign parent reference if legacy data is inconsistent.
        parent_space_id=config.parent_space_id if config.parent_space_id in owned else None,
        space_type=config.space_type, revision=config.hierarchy_revision,
        status=space.status, active=space.active,
    ) for space, config in rows]
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
        spaces = {space.id: space for space, _ in rows}
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

    space_type = patch.space_type.value if patch.space_type is not None else config.space_type
    if config.parent_space_id != parent_id or config.space_type != space_type:
        if parent_id is not None:
            await mark_managed(db, space_id)
            await mark_managed(db, parent_id)
        config.parent_space_id = parent_id
        config.space_type = space_type
        # Private navigation has its own revision; it does not invalidate publication.
        config.hierarchy_revision += 1
        await db.commit()
        logger.info("yullo.hierarchy.updated", extra={"space_id": str(space_id), "revision": config.hierarchy_revision})
    return current.model_copy(update={
        "parent_space_id": parent_id, "space_type": SpaceType(space_type), "revision": config.hierarchy_revision,
    })


async def require_no_children(db: AsyncSession, space_id: uuid.UUID) -> None:
    child = await db.scalar(select(YulloSpace.space_id).where(YulloSpace.parent_space_id == space_id).limit(1))
    if child is not None:
        raise HTTPException(409, "Detach subspaces before archiving or deleting this Space.")


async def list_public_child_events(db, space_id, *, search="", starts_after=None, starts_before=None, limit=10, config):
    """Narrow public-listing exception: direct event children, never their sources."""
    from datetime import datetime, timezone
    from app.models.yullo_config import YulloConfig
    from app.yullo.services.entities.service import get_public_entities
    from app.yullo.services.entities.payloads import project_public_entity_payload

    parent = (await db.execute(select(Space, YulloSpace).join(
        YulloSpace, YulloSpace.space_id == Space.id,
    ).where(Space.id == space_id, Space.product == "yullo", Space.active.is_(True),
            Space.status == "live", YulloSpace.lifecycle_status == "live"))).first()
    if not parent:
        return {"status": "unavailable", "events": []}
    statement = select(Space, YulloConfig).join(YulloSpace, YulloSpace.space_id == Space.id).outerjoin(
        YulloConfig, YulloConfig.space_id == Space.id,
    ).where(YulloSpace.parent_space_id == space_id, YulloSpace.space_type == "event",
            Space.owner_user_id == parent[0].owner_user_id, Space.product == "yullo",
            Space.active.is_(True), Space.status == "live", YulloSpace.lifecycle_status == "live")
    if search:
        statement = statement.where(Space.display_name.icontains(search, autoescape=True))
    rows = (await db.execute(statement.order_by(Space.id).limit(config.max_candidates + 1))).all()
    events = []
    for child, child_config in rows[:config.max_candidates]:
        records = [record for record in await get_public_entities(db, child.id, entity_types=("event", "location"))
                   if record.disclosure_mode in (None, "direct")]
        # Match this event's title; unrelated extracted events cannot supply its dates.
        payloads = [project_public_entity_payload(record, direct_only=True) for record in records if record.entity_type == "event"]
        matching = [payload for payload in payloads if str(payload.get("title", "")).strip().casefold() == child.display_name.strip().casefold()]
        event = matching[0] if len(matching) == 1 else {}
        start = None
        try:
            value = datetime.fromisoformat(str(event.get("starts_at", "")).replace("Z", "+00:00"))
            if value.tzinfo is not None:
                start = value
        except ValueError:
            pass
        if (starts_after or starts_before) and (start is None or (starts_after and start < starts_after) or (starts_before and start > starts_before)):
            continue
        location = next((project_public_entity_payload(record, direct_only=True) for record in records
                         if record.entity_type == "location" and str(record.id) == event.get("location_entity_id")), {})
        identity = (child_config.settings or {}).get("identity", {}) if child_config else {}
        events.append({"title": child.display_name, "url": f"/{child.slug}",
                       "description": identity.get("description") or "",
                       "starts_at": start.isoformat() if start else None,
                       "ends_at": event.get("ends_at"), "is_remote": event.get("is_remote"),
                       "location": {key: location[key] for key in ("name", "address", "map_url") if key in location} or None,
                       "registration_url": event.get("registration_url")})
    events.sort(key=lambda item: (datetime.fromisoformat(item["starts_at"]).timestamp() if item["starts_at"] else float("inf"), item["title"]))
    result = {"status": "success", "as_of": datetime.now(timezone.utc).isoformat(),
              "events": events[:limit], "has_more": len(events) > limit or len(rows) > config.max_candidates,
              "date_filter_excludes_unknown_dates": bool(starts_after or starts_before)}
    logger.info("yullo.events.listed", extra={"space_id": str(space_id), "returned": len(result["events"]), "has_more": result["has_more"]})
    return result


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

        @model_validator(mode="after")
        def ordered(self):
            if self.starts_after and self.starts_before and self.starts_after > self.starts_before:
                raise ValueError("Date range is reversed")
            return self

    async def list_events(search: str = "", starts_after: str | None = None, starts_before: str | None = None, limit: int = 10) -> dict:
        """List published event children of this Space. Optional date bounds are ISO timestamps with timezone. Unknown dates are excluded by date filters. No private child knowledge is read."""
        try:
            filters = Filters(search=search, starts_after=starts_after, starts_before=starts_before, limit=limit)
        except ValidationError:
            return {"status": "invalid_filters", "message": "Use a valid date range with timezone and a limit from 1 to 20."}
        try:
            return await list_public_child_events(db, context.space_id, search=filters.search,
                starts_after=filters.starts_after, starts_before=filters.starts_before,
                limit=min(filters.limit, config.max_results), config=config)
        except Exception as error:
            logger.warning("yullo.events.list_failed", extra={"space_id": str(context.space_id), "error_type": type(error).__name__})
            return {"status": "unavailable", "message": "Event listings are temporarily unavailable."}

    return [Function.from_callable(list_events)]

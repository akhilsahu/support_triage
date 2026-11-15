"""Quick form data becomes an ordinary child-local source, never a second entity store."""
import json

from fastapi import HTTPException

from app.orchestra.ai.prompts.yullo.quick_description import QUICK_DESCRIPTION_SYSTEM_PROMPT

from app.yullo.schemas.spaces import QuickDescriptionRequest, QuickDescriptionResponse, QuickSpaceContext, SUBSPACE_DESCRIPTION_LIMIT


def context_text(name: str, space_type: str, description: str | None, context: QuickSpaceContext) -> str:
    lines = [f"Name: {name}", f"Type: {space_type}"]
    if description:
        lines.append(f"Description: {description}")
    if context.starts_at:
        lines.append(f"Starts at: {context.starts_at.isoformat()}")
    if context.location_mode:
        lines.append(f"Event format: {context.location_mode}")
    if context.meeting_url:
        lines.append(f"Meeting link: {context.meeting_url}")
    if context.place:
        lines.append(f"Place: {context.place}")
    if context.latitude is not None and context.longitude is not None:
        lines.append(f"Venue coordinates: {context.latitude}, {context.longitude}")
    if context.map_url:
        lines.append(f"Map: {context.map_url}")
    if context.destination_url:
        lines.append(f"Link: {context.destination_url}")
    return "\n".join(lines)


async def suggest_description(request: QuickDescriptionRequest) -> QuickDescriptionResponse:
    from app.orchestra.ai.data_generation.identity_generate import generate_about_candidate

    payload = request.model_dump(mode="json")
    from app.yullo.schemas.spaces import resolve_space_type
    payload["space_type"], payload["type_label"] = resolve_space_type(request.space_type, request.type_label)
    if request.time_zone and request.context.starts_at:
        from zoneinfo import ZoneInfo
        payload["context"]["starts_at"] = request.context.starts_at.astimezone(ZoneInfo(request.time_zone)).isoformat()

    candidate = await generate_about_candidate([
        {"role": "system", "content": QUICK_DESCRIPTION_SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload)},
    ])
    description = candidate.get("description") if isinstance(candidate, dict) else None
    if not isinstance(description, str) or not description.strip() or len(description) > SUBSPACE_DESCRIPTION_LIMIT:
        raise HTTPException(503, "Could not suggest a description. Please write one or try again.")
    return QuickDescriptionResponse(description=description.strip())


async def save_event_records(db, *, user_id, space_id, name, context):
    """Owner-entered details use the canonical entity writers in the creation transaction."""
    from app.yullo.services.entities.service import create_owner_entity
    from app.yullo.services.entities.contracts import EntityCommand

    if context.destination_url:
        await create_owner_entity(db, user_id=user_id, space_id=space_id,
            command=EntityCommand(identity_key="event-booking", entity_type="action", payload_json={
                "label": "Book or register", "kind": "booking",
                "destination_url": str(context.destination_url),
            }, is_public=False))

    location = None
    if context.location_mode == "physical" and context.place.strip():
        location = await create_owner_entity(db, user_id=user_id, space_id=space_id,
            command=EntityCommand(identity_key="event-venue", entity_type="location", payload_json={
                "name": f"{name[:180]} venue", "address": context.place,
                "latitude": context.latitude, "longitude": context.longitude,
                "map_url": str(context.map_url) if context.map_url else None,
            }, is_public=False))
    elif context.location_mode == "online":
        location = await create_owner_entity(db, user_id=user_id, space_id=space_id,
            command=EntityCommand(identity_key="event-venue", entity_type="location",
                payload_json={"name": "Online / Remote", "is_remote": True}, is_public=False))
    if context.starts_at:
        await create_owner_entity(db, user_id=user_id, space_id=space_id,
            command=EntityCommand(identity_key="space-event", entity_type="event", payload_json={
                "title": name, "starts_at": context.starts_at.isoformat(),
                "location_entity_id": str(location.id) if location else None,
                "is_remote": context.location_mode == "online",
            }, is_public=False))


async def read_saved_event_context(db, space_id):
    """Read only the deterministic original form source; never mine unrelated sources."""
    import uuid
    from sqlalchemy import select
    from pydantic import ValidationError
    from app.models.knowledge_base import KnowledgeBaseItem

    source = await db.scalar(select(KnowledgeBaseItem).where(
        KnowledgeBaseItem.space_id == space_id,
        KnowledgeBaseItem.creation_key == str(uuid.uuid5(space_id, "quick-space-context")),
        KnowledgeBaseItem.item_type == "text",
    ))
    if not source:
        return None
    content = source.content
    if not content and source.source_locator:
        import aiofiles
        from app.orchestra.ai.ingestion.storage import materialize
        try:
            async with materialize(source.source_locator) as path:
                async with aiofiles.open(path, "r", encoding="utf-8") as stream:
                    content = await stream.read(8192)
        except (OSError, UnicodeError):
            return None
    if not content:
        return None
    fields = {}
    allowed = {"Starts at": "starts_at", "Event format": "location_mode", "Meeting link": "meeting_url", "Place": "place", "Map": "map_url"}
    for line in content.splitlines():
        key, separator, value = line.partition(": ")
        if separator and key in allowed:
            fields[allowed[key]] = value
        elif key == "Venue coordinates" and separator:
            try:
                lat, lng = value.split(", ")
                fields.update(latitude=float(lat), longitude=float(lng))
            except ValueError:
                pass
    if not fields.get("location_mode"):
        if fields.get("meeting_url"):
            fields["location_mode"] = "online"
        elif fields.get("place"):
            fields["location_mode"] = "physical"
    try:
        return QuickSpaceContext.model_validate(fields)
    except ValidationError:
        return None


async def read_event_presence(db, space_id, saved_context=None, *, space_name=""):
    """Owner-only identity projection from this event's canonical location, not company data."""
    from sqlalchemy import select
    from app.models.yullo_space_entity import YulloSpaceEntity

    records = list((await db.scalars(select(YulloSpaceEntity).where(
        YulloSpaceEntity.space_id == space_id,
        YulloSpaceEntity.entity_type.in_(("event", "location")),
    ))).all())
    event = next((record for record in records if record.entity_type == "event" and record.identity_key == "space-event"), None)
    if event is None and space_name:
        matches = [record for record in records if record.entity_type == "event"
                   and str((record.payload_json or {}).get("title") or "").strip().casefold() == space_name.strip().casefold()
                   and record.is_active and record.review_status in ("owner_confirmed", "source_authoritative")]
        event = matches[0] if len(matches) == 1 else None
    venue = next((record for record in records if record.entity_type == "location" and record.identity_key == "event-venue"), None)

    def eligible(record):
        return record.is_active and record.review_status in ("owner_confirmed", "source_authoritative")

    if event:
        if not eligible(event):
            return None
        location_id = (event.payload_json or {}).get("location_entity_id")
        if location_id:
            venue = next((record for record in records if record.entity_type == "location" and str(record.id) == str(location_id)), None)
            if venue is None:
                return None
        elif venue:
            # A removed link is authoritative; never restore an old venue from the form source.
            return "online" if (event.payload_json or {}).get("is_remote") is True else None
        elif (event.payload_json or {}).get("is_remote") is True:
            return "online"
    if venue:
        if not eligible(venue):
            return None
        payload = venue.payload_json or {}
        return "online" if payload.get("is_remote") is True else "physical" if payload.get("address") else None
    # Legacy/unspecified-address events may have only the deterministic saved form source.
    return saved_context.location_mode if saved_context else None

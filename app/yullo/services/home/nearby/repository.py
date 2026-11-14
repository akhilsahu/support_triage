"""Read canonical Yullo entities; discovery never reads knowledge or conversations."""
from datetime import datetime, timezone
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity
from app.yullo.schemas.nearby import NearbyArea, NearbyOrigin
from app.yullo.services.entities.payloads import project_public_entity_payload
from app.yullo.services.entities.service import PUBLIC_REVIEW_STATUSES, public_entity_predicates
from app.yullo.services.home.nearby.ranking import NearbyCandidate


def _area(payload: dict) -> NearbyArea:
    return NearbyArea(**{key: payload.get(key) for key in NearbyArea.model_fields})


async def load_origins(db: AsyncSession, user_id: UUID) -> list[NearbyOrigin]:
    rows = await db.execute(
        select(YulloSpaceEntity, Space.display_name)
        .join(Space, Space.id == YulloSpaceEntity.space_id)
        .join(YulloSpace, YulloSpace.space_id == Space.id)
        .where(
            Space.owner_user_id == user_id, Space.product == "yullo", Space.active.is_(True),
            YulloSpaceEntity.entity_type == "location", YulloSpaceEntity.is_active.is_(True),
            YulloSpaceEntity.review_status.in_(PUBLIC_REVIEW_STATUSES),
        ).order_by(Space.id, YulloSpaceEntity.sort_order, YulloSpaceEntity.id)
    )
    origins = []
    for entity, space_name in rows:
        payload = entity.payload_json or {}
        if payload.get("is_remote") is True:
            continue
        try:
            area = _area(payload)
        except ValidationError:
            continue
        if area.latitude is None and area.country_code is None:
            continue
        origins.append(NearbyOrigin(
            **area.model_dump(), id=entity.id, name=payload.get("name") or "Location",
            space_id=entity.space_id, space_name=space_name,
        ))
    return origins


def _discovery_payload(entity: YulloSpaceEntity) -> dict:
    payload = project_public_entity_payload(entity)
    raw = entity.field_policies or {}
    fields = raw.get("fields", raw) if isinstance(raw, dict) else {}
    if not isinstance(fields, dict):
        return {}
    # Discovery is direct disclosure. Aura-only/on-request fields cannot rank or display.
    for key, policy in fields.items():
        visibility = policy.get("visibility") if isinstance(policy, dict) else policy
        disclosure = policy.get("disclosureMode", policy.get("disclosure_mode")) if isinstance(policy, dict) else None
        if visibility not in (None, "public") or disclosure not in (None, "direct"):
            if isinstance(key, str):
                payload.pop(key.split(".")[0], None)
    return payload


def _event_time(value: str | None) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except ValueError:
        return None


async def load_candidates(db: AsyncSession, now: datetime) -> list[NearbyCandidate]:
    rows = await db.execute(
        select(YulloSpaceEntity, Space.display_name, Space.slug)
        .join(Space, Space.id == YulloSpaceEntity.space_id)
        .join(YulloSpace, YulloSpace.space_id == Space.id)
        .where(
            Space.product == "yullo", Space.active.is_(True), Space.status == "live",
            YulloSpace.lifecycle_status == "live",
            *public_entity_predicates(Space.id),
            or_(YulloSpaceEntity.visibility.is_(None), YulloSpaceEntity.visibility == "public"),
            or_(YulloSpaceEntity.disclosure_mode.is_(None), YulloSpaceEntity.disclosure_mode == "direct"),
            YulloSpaceEntity.entity_type.in_(("location", "event")),
        ).order_by(YulloSpaceEntity.id)
    )
    records = [(entity, name, slug, _discovery_payload(entity)) for entity, name, slug in rows]
    locations = {}
    candidates = []
    for entity, name, slug, payload in records:
        if entity.entity_type != "location":
            continue
        try:
            area = _area(payload)
        except ValidationError:
            continue
        remote = payload.get("is_remote") is True
        locations[(entity.space_id, str(entity.id))] = area, remote
        candidates.append(NearbyCandidate(
            id=f"space:{entity.space_id}", kind="space", space_id=entity.space_id,
            space_name=name, slug=slug, title=name, area=area, is_remote=remote,
        ))
    for entity, name, slug, payload in records:
        if entity.entity_type != "event" or not payload.get("title"):
            continue
        starts = _event_time(payload.get("starts_at"))
        ends = _event_time(payload.get("ends_at"))
        if starts is None or (payload.get("ends_at") and ends is None):
            continue
        if (ends or starts) < now or (ends and ends < starts):
            continue
        remote = payload.get("is_remote") is True
        location = locations.get((entity.space_id, payload.get("location_entity_id")))
        if remote:
            area = NearbyArea()
        elif location:
            area, remote = location
        else:
            continue
        candidates.append(NearbyCandidate(
            id=f"event:{entity.id}", kind="event", space_id=entity.space_id,
            space_name=name, slug=slug, title=payload["title"], area=area,
            is_remote=remote, starts_at=starts,
        ))
    return candidates

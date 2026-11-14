"""Pure discovery matching; no database, location lookup, or owner context."""
from dataclasses import dataclass
from datetime import datetime
from heapq import nsmallest
from math import asin, cos, radians, sin, sqrt
from uuid import UUID

from app.yullo.schemas.nearby import NearbyArea, NearbyItem, NearbyRequest


@dataclass(frozen=True)
class NearbyCandidate:
    id: str
    kind: str
    space_id: UUID
    space_name: str
    slug: str
    title: str
    area: NearbyArea
    is_remote: bool = False
    starts_at: datetime | None = None


def distance_km(origin: NearbyArea, target: NearbyArea) -> float | None:
    if any(value is None for value in (
        origin.latitude, origin.longitude, target.latitude, target.longitude,
    )):
        return None
    lat1, lat2 = radians(origin.latitude), radians(target.latitude)
    dlat = lat2 - lat1
    dlon = radians(target.longitude - origin.longitude)
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(min(1, max(0, a))))


def rank_nearby(
    candidates: list[NearbyCandidate], origin: NearbyArea, request: NearbyRequest,
    *, radius_km: float, limit: int,
) -> list[NearbyItem]:
    # Multiple locations compete for one Space slot; events keep their own identity.
    best: dict[str, tuple[tuple, NearbyItem]] = {}
    for candidate in candidates:
        distance = None if candidate.is_remote else distance_km(origin, candidate.area)
        same_country = bool(origin.country_code and origin.country_code == candidate.area.country_code)
        same_region = bool(
            same_country and origin.region and candidate.area.region
            and origin.region.casefold() == candidate.area.region.casefold()
        )
        same_city = bool(
            same_country and origin.city and candidate.area.city
            and origin.city.casefold() == candidate.area.city.casefold()
            and (not origin.region or not candidate.area.region or same_region)
        )
        if candidate.is_remote:
            tier, priority = "remote", 4
        elif distance is not None and distance <= radius_km:
            tier, priority = "nearby", 0
        elif same_city:
            tier, priority = "city", 1
        elif not origin.city and same_region:
            tier, priority = "region", 2
        elif not origin.city and not origin.region and same_country:
            tier, priority = "country", 3
        else:
            continue
        if request.scope == "nearby" and tier != "nearby":
            continue
        if request.scope == "city" and (candidate.is_remote or not same_city):
            continue
        if request.scope == "remote" and tier != "remote":
            continue
        key = (
            priority, distance if distance is not None else float("inf"),
            candidate.starts_at.timestamp() if candidate.starts_at else float("inf"),
            candidate.title.casefold(), candidate.id,
        )
        label = "Remote" if candidate.is_remote else ", ".join(
            part for part in (candidate.area.city, candidate.area.region, candidate.area.country_code) if part
        ) or "Within 10 km"
        item = NearbyItem(
            id=candidate.id, kind=candidate.kind, space_id=candidate.space_id,
            space_name=candidate.space_name, slug=candidate.slug, title=candidate.title,
            tier=tier, area_label=label,
            distance_km=round(distance, 2) if distance is not None else None,
            starts_at=candidate.starts_at,
        )
        if candidate.id not in best or key < best[candidate.id][0]:
            best[candidate.id] = key, item
    return [item for _, item in nsmallest(limit, best.values(), key=lambda pair: pair[0])]

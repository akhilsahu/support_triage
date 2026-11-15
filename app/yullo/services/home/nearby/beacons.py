"""Public Beacon cards only; targeting coordinates and private content never leave here."""
from sqlalchemy import Float, and_, cast, or_, select
from pydantic import ValidationError

from app.models.space import Space
from app.models.yullo_config import YulloConfig
from app.yullo.schemas.spaces import saved_type_label
from app.models.yullo_space import YulloSpace
from app.yullo.config.beacon import get_beacon_rules
from app.yullo.models.space_beacon import YulloSpaceBeacon
from app.yullo.schemas.nearby import BeaconCard, NearbyArea
from app.yullo.services.entities.presentation import public_page_details
from app.yullo.services.entities.service import get_public_entities
from app.yullo.services.home.nearby.ranking import distance_km
from app.yullo.services.spaces.beacon import _event_expiry
from app.yullo.services.spaces.hierarchy import live_branch_path
from app.yullo.services.home.nearby.repository import _event_time


def _normalized(value):
    return " ".join((value or "").casefold().split())


def match_beacon(reach, target, viewer):
    """Returns eligibility and an internal ranking distance; radius is the owner's chosen reach."""
    if reach == "worldwide":
        return True, None
    if reach.startswith("nearby_"):
        distance = distance_km(viewer, target)
        return distance is not None and distance <= int(reach.split("_")[1]), distance
    country = bool(viewer.country_code and viewer.country_code == target.country_code)
    if reach == "country":
        return country, None
    city = bool(country and viewer.city and _normalized(viewer.city) == _normalized(target.city))
    # A specified region disambiguates cities that share a name within a country.
    return bool(city and (not target.region or _normalized(viewer.region) == _normalized(target.region))), None


async def load_beacon_cards(db, viewer, request, now):
    rules = get_beacon_rules()
    if not rules.enabled:
        return []
    beacon = YulloSpaceBeacon
    areas = [beacon.reach == "worldwide"]
    if viewer.country_code:
        areas.append(and_(beacon.reach.in_(("city", "country")), beacon.target_area["country_code"].astext == viewer.country_code))
    if viewer.latitude is not None:
        # Latitude prefilter is pole-safe; exact great-circle matching follows below.
        areas.append(and_(beacon.reach.in_(("nearby_5", "nearby_10")),
            cast(beacon.target_area["latitude"].astext, Float).between(viewer.latitude - 0.091, viewer.latitude + 0.091)))
    statement = select(beacon, Space, YulloSpace, YulloConfig).join(Space, Space.id == beacon.space_id).join(
        YulloSpace, YulloSpace.space_id == beacon.space_id,
    ).outerjoin(YulloConfig, YulloConfig.space_id == Space.id).where(beacon.state == "active", beacon.expires_at > now,
            Space.product == "yullo", Space.active.is_(True), Space.status == "live",
            YulloSpace.lifecycle_status == "live", YulloSpace.parent_space_id.is_not(None), or_(*areas))
    if request.beacon_scope != "all":
        statement = statement.where(beacon.reach.in_(("nearby_5", "nearby_10")) if request.beacon_scope == "nearby" else beacon.reach == request.beacon_scope)
    rows = (await db.execute(statement.order_by(beacon.space_id))).all()
    cards, ancestors = [], {}
    for row, space, extension, settings in rows:
        try:
            target = NearbyArea.model_validate(row.target_area)
        except ValidationError:
            continue
        matches, distance = match_beacon(row.reach, target, viewer)
        if not matches:
            continue
        path = await live_branch_path(db, space, extension, ancestor_cache=ancestors)
        if not path:
            continue
        event_expiry = await _event_expiry(db, space.id, space.display_name) if extension.space_type == "event" else None
        if event_expiry and event_expiry <= now:
            continue
        entities = await get_public_entities(db, space.id, entity_types=("event", "location", "action"))
        details = public_page_details(entities, space_type=extension.space_type, space_name=space.display_name, is_subspace=True)["pageDetails"]
        label = "Worldwide" if row.reach == "worldwide" else f"Within {row.reach.split('_')[1]} km" if row.reach.startswith("nearby_") else ", ".join(
            part for part in ((target.city, target.region, target.country_code) if row.reach == "city" else (target.country_code,)) if part)
        card = BeaconCard(space_id=space.id, title=space.display_name, url=path,
            space_type=extension.space_type, type_label=saved_type_label(extension.space_type, settings.settings if settings else None), cover_url=space.logo_url,
            starts_at=details["startsAt"], location_label=details["locationLabel"],
            reach=row.reach, area_label=label, expires_at=row.expires_at,
            )
        # Keep target distance internal: it could reveal a private targeting point.
        starts = _event_time(card.starts_at)
        cards.append(((distance if distance is not None else float("inf"),
                       starts.timestamp() if starts else float("inf"), card.title.casefold(), str(card.space_id)), card))
    cards.sort(key=lambda entry: entry[0])
    return [card for _, card in cards[:rules.max_results]]

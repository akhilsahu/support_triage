"""One disclosure-safe static-page projection for Studio and public views."""
from urllib.parse import urlsplit

from app.models.yullo_space_entity import YulloSpaceEntity
from app.yullo.services.entities.payloads import project_public_entity_payload, _remove_payload_path


def _page_payload(entity):
    if (not entity.is_active or not entity.is_public
            or entity.review_status not in ("owner_confirmed", "source_authoritative")
            or entity.visibility not in (None, "public")
            or entity.disclosure_mode not in (None, "direct")):
        return {}
    payload = project_public_entity_payload(entity, direct_only=True)
    policies = entity.field_policies or {}
    fields = policies.get("fields", policies) if isinstance(policies, dict) else None
    if not isinstance(fields, dict):
        return {}
    for path, policy in fields.items():
        if not isinstance(path, str):
            continue
        visibility = policy.get("visibility") if isinstance(policy, dict) else policy
        if visibility not in (None, "public"):
            _remove_payload_path(payload, path)
    return payload


def _action_link(entity, payload):
    label, url = payload.get("label"), payload.get("destination_url")
    if not isinstance(label, str) or not label.strip() or not isinstance(url, str):
        return None
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return None
    except ValueError:
        return None
    return {"id": str(entity.id), "label": label.strip(), "url": url}


def public_booking_links(entities: list[YulloSpaceEntity], *, include_other: bool = False) -> list[dict[str, str]]:
    """Project static-page links; public-Aura permission alone is insufficient."""
    links = []
    if include_other:
        entities = sorted(entities, key=lambda entity: (entity.payload_json or {}).get("kind") != "booking")
    for entity in entities:
        if entity.entity_type != "action":
            continue
        payload = _page_payload(entity)
        if payload.get("kind") not in (("booking", "enquiry", "external_link") if include_other else ("booking",)):
            continue
        link = _action_link(entity, payload)
        if link:
            links.append(link)
    return links


def _page_details(eligible, *, space_type, space_name):
    event = next((payload for entity, payload in eligible
                  if entity.entity_type == "event" and payload and
                  (entity.identity_key == "space-event" or payload.get("title") == space_name)), {}) if space_type == "event" else {}
    venue = next((payload for entity, payload in eligible if entity.entity_type == "location"
                  and payload and str(entity.id) == event.get("location_entity_id")), {})
    if space_type != "event":
        venue = next((payload for entity, payload in eligible if entity.entity_type == "location" and payload), {})
    location = "Online" if venue.get("is_remote") or event.get("is_remote") else venue.get("address")
    return {
        "spaceType": space_type,
        "startsAt": event.get("starts_at"),
        "endsAt": event.get("ends_at"),
        "locationLabel": location,
        "locationUrl": venue.get("map_url"),
        "latitude": venue.get("latitude") if location and not venue.get("is_remote") else None,
        "longitude": venue.get("longitude") if location and not venue.get("is_remote") else None,
        "isRemote": bool(venue.get("is_remote") or event.get("is_remote")),
    }


def public_page_details(entities, *, space_type, space_name, is_subspace):
    return {
        "bookingLinks": public_booking_links(entities, include_other=is_subspace),
        "pageDetails": _page_details([(entity, _page_payload(entity)) for entity in entities],
                                     space_type=space_type, space_name=space_name),
    }


def owner_preview_page_details(entities, *, space_type, space_name):
    """Owner-authorized Studio data only; never merge this into a public projection."""
    eligible = [(entity, entity.payload_json or {}) for entity in entities
                if entity.is_active and entity.review_status in ("owner_confirmed", "source_authoritative")]
    return _page_details(eligible, space_type=space_type, space_name=space_name)



def owner_preview_booking_links(entities):
    """Owner-authorized authoring data only; never use in public responses/model context."""
    public_ids = {link["id"] for link in public_booking_links(entities)}
    links = []
    for entity in entities:
        if (entity.entity_type != "action" or not entity.is_active
                or entity.review_status not in ("owner_confirmed", "source_authoritative")
                or (entity.payload_json or {}).get("kind") != "booking"):
            continue
        link = _action_link(entity, entity.payload_json)
        if link:
            links.append({**link, "visibleOnPage": link["id"] in public_ids})
    return links

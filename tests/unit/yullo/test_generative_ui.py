import uuid
from types import SimpleNamespace

from app.orchestra.ai.ui_render.entity_cards import (
    build_entity_manifest,
    build_validated_ui_node,
)

from app.yullo.services.entities.payloads import public_entity_card


def _entity(entity_type: str, title: str):
    return public_entity_card(SimpleNamespace(
        id=uuid.uuid4(),
        entity_type=entity_type,
        payload_json={"name": title},
        field_policies={},
    ))


def test_builds_cards_only_from_matching_available_entities():
    offering = _entity("offering", "Brand strategy")
    location = _entity("location", "Studio")

    assert build_validated_ui_node("service", [str(offering["id"])], [offering, location]) == {
        "type": "service",
        "entityId": str(offering["id"]),
    }
    assert build_validated_ui_node("service", [str(location["id"])], [offering, location]) is None
    assert build_validated_ui_node("service", [str(uuid.uuid4())], [offering, location]) is None


def test_groups_verified_actions_and_rejects_multiple_single_cards():
    first = _entity("action", "Book a call")
    second = _entity("action", "Send an enquiry")
    offering = _entity("offering", "Brand strategy")

    assert build_validated_ui_node("actions", [str(first["id"]), str(second["id"])], [first, second]) == {
        "type": "actions",
        "entityIds": [str(first["id"]), str(second["id"])],
    }
    assert build_validated_ui_node(
        "service",
        [str(offering["id"]), str(offering["id"])],
        [offering],
    ) == {"type": "service", "entityId": str(offering["id"])}


def test_manifest_exposes_ids_titles_and_ui_types_without_payloads():
    offering = _entity("offering", "Brand strategy")
    manifest = build_entity_manifest([offering])

    assert str(offering["id"]) in manifest
    assert "Card: service" in manifest
    assert "Brand strategy" in manifest
    assert "payload_json" not in manifest

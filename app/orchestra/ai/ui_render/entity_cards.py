"""Data-only entity-card tool contracts and authorized-record selection.

Callers supply policy-projected records from an authorized source. Database
access and field disclosure policies belong to the product entity service.
"""
from collections.abc import Sequence
from typing import Any

UI_TYPE_TO_ENTITY_TYPE = {
    "service": "offering",
    "location": "location",
    "portfolio": "portfolio_item",
    "actions": "action",
}

SHOW_UI_CARD_TOOL = {
    "type": "function",
    "function": {
        "name": "show_ui_card",
        "description": (
            "Render verified Space information as rich UI when it materially helps the answer. "
            "Use only entity IDs supplied in the available-entities manifest."
        ),
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "card_type": {
                    "type": "string",
                    "enum": list(UI_TYPE_TO_ENTITY_TYPE),
                },
                "entity_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 4,
                },
            },
            "required": ["card_type", "entity_ids"],
        },
    },
}


def build_entity_manifest(entities: Sequence[dict[str, Any]]) -> str:
    lines = [
        "Available verified UI entities for this Space:",
        "Use only these exact IDs. Do not create a card when ordinary text is clearer.",
    ]
    entity_type_to_ui_type = {value: key for key, value in UI_TYPE_TO_ENTITY_TYPE.items()}
    for entity in entities:
        card_type = entity_type_to_ui_type.get(entity.get('entity_type'))
        if card_type:
            lines.append(
                f"- ID: {entity['id']} | Card: {card_type} "
                f"| Title: {entity['title']} | Existing images: {entity.get('image_count', 0)}"
            )
    return "\n".join(lines)


def build_validated_ui_node(
    card_type: Any,
    entity_ids: Any,
    available_entities: Sequence[dict[str, Any]],
) -> dict[str, Any] | None:
    if not isinstance(card_type, str):
        return None
    expected_entity_type = UI_TYPE_TO_ENTITY_TYPE.get(card_type)
    if not expected_entity_type or not isinstance(entity_ids, list):
        return None

    normalized_ids = list(dict.fromkeys(str(entity_id) for entity_id in entity_ids if entity_id))
    if not normalized_ids or len(normalized_ids) > 4:
        return None
    if card_type != "actions" and len(normalized_ids) != 1:
        return None

    available_by_id = {str(entity["id"]): entity for entity in available_entities}
    selected = [available_by_id.get(entity_id) for entity_id in normalized_ids]
    if any(entity is None or entity["entity_type"] != expected_entity_type for entity in selected):
        return None

    if card_type == "actions":
        return {"type": "actions", "entityIds": normalized_ids}
    return {"type": card_type, "entityId": normalized_ids[0]}


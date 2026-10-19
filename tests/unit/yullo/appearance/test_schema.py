import uuid

import pytest
from pydantic import ValidationError

from app.yullo.schemas.appearance import SpacePresentationConfig, default_presentation_config
from app.yullo.services.appearance_assets import config_references_asset


def test_default_config_round_trips_with_aliases():
    config = default_presentation_config("creator")
    payload = config.model_dump(mode="json", by_alias=True)

    assert payload["themePreset"] == "editorial"
    assert SpacePresentationConfig.model_validate(payload) == config


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update({"unknown": True}),
        lambda payload: payload.update({"accent": "rainbow"}),
        lambda payload: payload["sections"].append(payload["sections"][0]),
        lambda payload: payload.update(
            {"sections": [section for section in payload["sections"] if section["type"] != "identity"]}
        ),
    ],
)
def test_invalid_config_is_rejected(mutate):
    payload = default_presentation_config("business").model_dump(
        mode="json", by_alias=True
    )
    mutate(payload)

    with pytest.raises(ValidationError):
        SpacePresentationConfig.model_validate(payload)


def test_asset_reference_detection_is_exact():
    asset_id = uuid.uuid4()
    other_id = uuid.uuid4()
    payload = default_presentation_config("business").model_dump(
        mode="json", by_alias=True
    )
    payload["hero"]["assetId"] = str(asset_id)

    assert config_references_asset(payload, asset_id)
    assert not config_references_asset(payload, other_id)

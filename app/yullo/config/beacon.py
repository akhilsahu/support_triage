import os

from pydantic import BaseModel, ConfigDict, Field


class BeaconRules(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    enabled: bool = True
    max_days: int = Field(30, ge=1, le=90)
    default_days: int = Field(1, ge=1, le=30)
    max_results: int = Field(9, ge=1, le=30)
    activation_limit: int = Field(20, ge=1, le=100)


def get_beacon_rules() -> BeaconRules:
    return BeaconRules(
        enabled=os.getenv("YULLO_BEACON_ENABLED", "true"),
        max_days=os.getenv("YULLO_BEACON_MAX_DAYS", "30"),
        default_days=os.getenv("YULLO_BEACON_DEFAULT_DAYS", "1"),
        max_results=os.getenv("YULLO_BEACON_MAX_RESULTS", "9"),
        activation_limit=os.getenv("YULLO_BEACON_ACTIVATION_LIMIT", "20"),
    )


NEARBY_REACHES = ("nearby", "nearby_5", "nearby_10")


def beacon_radius(reach, radius_km=None):
    """Legacy rows keep their original reach; configurable rows supply a radius."""
    return radius_km if radius_km is not None else {"nearby_5": 5, "nearby_10": 10}.get(reach)

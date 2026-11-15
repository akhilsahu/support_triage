import os

from pydantic import BaseModel, ConfigDict, Field


class BeaconRules(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    enabled: bool = True
    max_days: int = Field(30, ge=1, le=90)
    default_days: int = Field(7, ge=1, le=30)
    max_results: int = Field(9, ge=1, le=30)
    activation_limit: int = Field(20, ge=1, le=100)


def get_beacon_rules() -> BeaconRules:
    return BeaconRules(
        enabled=os.getenv("YULLO_BEACON_ENABLED", "true"),
        max_days=os.getenv("YULLO_BEACON_MAX_DAYS", "30"),
        default_days=os.getenv("YULLO_BEACON_DEFAULT_DAYS", "7"),
        max_results=os.getenv("YULLO_BEACON_MAX_RESULTS", "9"),
        activation_limit=os.getenv("YULLO_BEACON_ACTIVATION_LIMIT", "20"),
    )

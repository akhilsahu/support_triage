from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


class AppearanceRuntimeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    assistant_enabled: bool = True
    model: str = "gpt-4o-mini"
    timeout_seconds: float = Field(default=15.0, ge=1, le=60)
    max_context_characters: int = Field(default=6000, ge=500, le=20000)
    max_assets: int = Field(default=24, ge=1, le=100)
    max_asset_bytes: int = Field(default=10 * 1024 * 1024, ge=1024)
    max_asset_pixels: int = Field(default=40_000_000, ge=1_000_000)

    preview_generation_enabled: bool = True
    preview_model: str = "gpt-4o-mini"
    preview_timeout_seconds: float = Field(default=15.0, ge=1, le=60)
    preview_max_context_characters: int = Field(default=6000, ge=2000, le=20000)
    preview_max_items_per_section: int = Field(default=4, ge=1, le=4)
    preview_prompt_version: str = "v1"


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_appearance_runtime_config() -> AppearanceRuntimeConfig:
    return AppearanceRuntimeConfig(
        enabled=_env_bool("YULLO_APPEARANCE_ENABLED", True),
        assistant_enabled=_env_bool("YULLO_APPEARANCE_ASSISTANT_ENABLED", True),
        model=os.getenv("YULLO_APPEARANCE_MODEL", "gpt-4o-mini"),
        timeout_seconds=float(os.getenv("YULLO_APPEARANCE_TIMEOUT_SECONDS", "15")),
        max_context_characters=int(os.getenv("YULLO_APPEARANCE_MAX_CONTEXT_CHARACTERS", "6000")),
        max_assets=int(os.getenv("YULLO_APPEARANCE_MAX_ASSETS", "24")),
        max_asset_bytes=int(os.getenv("YULLO_APPEARANCE_MAX_ASSET_BYTES", str(10 * 1024 * 1024))),
        max_asset_pixels=int(os.getenv("YULLO_APPEARANCE_MAX_ASSET_PIXELS", "40000000")),
        preview_generation_enabled=_env_bool("YULLO_APPEARANCE_PREVIEW_ENABLED", True),
        preview_model=os.getenv("YULLO_APPEARANCE_PREVIEW_MODEL", "gpt-4o-mini"),
        preview_timeout_seconds=float(os.getenv("YULLO_APPEARANCE_PREVIEW_TIMEOUT_SECONDS", "15.0")),
        preview_max_context_characters=int(os.getenv("YULLO_APPEARANCE_PREVIEW_MAX_CONTEXT_CHARACTERS", "6000")),
        preview_max_items_per_section=int(os.getenv("YULLO_APPEARANCE_PREVIEW_MAX_ITEMS_PER_SECTION", "4")),
        preview_prompt_version=os.getenv("YULLO_APPEARANCE_PREVIEW_PROMPT_VERSION", "v1"),
    )

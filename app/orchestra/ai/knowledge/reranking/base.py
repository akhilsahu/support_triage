"""
RerankerConfig — typed view of the RERANK_* settings.

One source of truth read by the registry when building a reranker.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RerankerConfig:
    enabled:  bool
    provider: str            # registry key, e.g. "cohere" | "sentence_transformer" | "none"
    model:    str            # "" → provider's own default
    top_n:    int
    api_key:  Optional[str]


def get_reranker_config() -> RerankerConfig:
    from app.config import settings
    return RerankerConfig(
        enabled=settings.RERANK_ENABLED,
        provider=(settings.RERANK_PROVIDER or "none").strip().lower(),
        model=(settings.RERANK_MODEL or "").strip(),
        top_n=settings.RERANK_TOP_N,
        api_key=settings.COHERE_API_KEY,
    )

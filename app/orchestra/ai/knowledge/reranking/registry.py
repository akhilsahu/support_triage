"""
Reranker registry — pluggable provider builders.

A reranker provider is just a function `(RerankerConfig) -> reranker_or_None`
registered under a name. To plug in a new reranker, register a builder:

    from app.orchestra.ai.knowledge.reranking import register

    @register("my_reranker")
    def _build(cfg):
        from my_pkg import MyReranker
        return MyReranker(top_n=cfg.top_n, model=cfg.model or "default")

Then set RERANK_PROVIDER=my_reranker. To replace an existing one, register a
different builder under the same name. Nothing else changes — the knowledge
backend only calls build_reranker().
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import structlog

from app.orchestra.ai.knowledge.reranking.base import RerankerConfig, get_reranker_config

logger = structlog.get_logger()

RerankerBuilder = Callable[[RerankerConfig], Any]

_REGISTRY: Dict[str, RerankerBuilder] = {}


def register(name: str) -> Callable[[RerankerBuilder], RerankerBuilder]:
    """Decorator: register a reranker builder under `name` (case-insensitive)."""
    key = name.strip().lower()

    def _decorator(fn: RerankerBuilder) -> RerankerBuilder:
        _REGISTRY[key] = fn
        return fn

    return _decorator


def available_providers() -> List[str]:
    return sorted(_REGISTRY)


def build_reranker(cfg: Optional[RerankerConfig] = None) -> Optional[Any]:
    """
    Build the configured reranker, or None. Skippable (enabled=False /
    provider="none"), switchable (any registered provider), and graceful —
    a missing dependency, unknown provider, or build error returns None with a
    warning so retrieval still works without reranking.
    """
    cfg = cfg or get_reranker_config()

    if not cfg.enabled or cfg.provider == "none":
        return None

    builder = _REGISTRY.get(cfg.provider)
    if builder is None:
        logger.warning("reranking.unknown_provider",
                       provider=cfg.provider, available=available_providers())
        return None

    try:
        reranker = builder(cfg)
        logger.info("reranking.built", provider=cfg.provider,
                    reranker=type(reranker).__name__ if reranker else None)
        return reranker
    except ImportError:
        logger.warning("reranking.missing_dep", provider=cfg.provider)
    except Exception as e:
        logger.error("reranking.build_error", provider=cfg.provider, error=str(e))
    return None

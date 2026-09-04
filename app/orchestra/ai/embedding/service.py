"""
Embedding factories — the write path and the read path, built from ONE config.

Nothing here holds state or embeds directly: each factory returns the embedder
object its own library expects (a ChromaDB embedding function for writes, an
Agno embedder for reads), both configured from the same EmbeddingConfig so the
model and dimensions can never drift between them.

Provider (OpenAI direct vs an OpenAI-compatible proxy like OpenRouter) is
resolved in config.py — see EmbeddingConfig.base_url.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger()


# ── Shared factories (write path + read path build from ONE config) ───────────
# Both the ChromaDB write path and the Agno read path must use the same model +
# dimensions or query vectors won't match stored vectors. These build each from
# the single EmbeddingConfig so they can never drift.

class _UsageTrackedEmbeddingFunction:
    """Wraps a Chroma embedding function; records fail-open usage per batch.

    The write path (ingestion) is the bulk of embedding cost — attribute it to
    the kb in the AiUsageContext (set by ingestion tasks). Token counts are
    estimated (chars/4): the OpenAI embeddings API here reports no usage.
    Vector return values are passed through untouched.
    """

    def __init__(self, inner, provider: str, model: str):
        self._inner = inner
        self._provider = provider
        self._model = model

    def __call__(self, input):  # noqa: A002 — Chroma's EF signature
        import time as _time
        _t0 = _time.monotonic()
        vectors = self._inner(input)
        try:
            import asyncio

            from app.services.ai_usage import (
                build_usage_event,
                estimate_tokens,
                record_usage_event,
            )
            ev = build_usage_event(
                kind="embedding", provider=self._provider, model=self._model,
                latency_ms=int((_time.monotonic() - _t0) * 1000),
                usage={"prompt_tokens": estimate_tokens("".join(input or [])),
                       "completion_tokens": 0},
                estimated=True,
                meta={"batch_size": len(input or [])},
            )
            asyncio.get_running_loop().create_task(record_usage_event(ev))
        except Exception as e:  # telemetry must never break ingestion
            logger.warning("embedding.usage_track_failed", error=str(e))
        return vectors

    def __getattr__(self, name):
        # Delegate everything else (name(), config, ...) to the inner EF.
        return getattr(self._inner, name)


def build_chroma_embedding_function(cfg=None):
    """OpenAIEmbeddingFunction for the ChromaDB write path. None on failure.

    cfg.base_url routes through an OpenAI-compatible proxy (OpenRouter) —
    passed as `api_base` here vs `base_url` on the Agno side; same idea, the
    two libraries just name the parameter differently.
    """
    from app.orchestra.ai.embedding.config import get_embedding_config
    cfg = cfg or get_embedding_config()
    try:
        from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
        kwargs = dict(
            api_key=cfg.api_key,
            model_name=cfg.model,
            dimensions=cfg.dimensions,
        )
        if cfg.base_url:
            kwargs["api_base"] = cfg.base_url
        return _UsageTrackedEmbeddingFunction(
            OpenAIEmbeddingFunction(**kwargs), provider="openai", model=cfg.model,
        )
    except Exception as e:
        logger.warning("embedding.chroma_ef_unavailable", error=str(e))
        return None


def build_agno_embedder(cfg=None):
    """Agno OpenAIEmbedder for the knowledge/read path. None if agno missing."""
    from app.orchestra.ai.embedding.config import get_embedding_config
    cfg = cfg or get_embedding_config()
    try:
        from agno.knowledge.embedder.openai import OpenAIEmbedder
        kwargs = dict(
            id=cfg.model,
            dimensions=cfg.dimensions,
            api_key=cfg.api_key,
        )
        if cfg.base_url:
            kwargs["base_url"] = cfg.base_url
        return OpenAIEmbedder(**kwargs)
    except Exception as e:
        logger.warning("embedding.agno_embedder_unavailable", error=str(e))
        return None

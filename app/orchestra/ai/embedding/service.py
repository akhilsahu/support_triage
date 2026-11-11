"""Embedding adapters for document indexing and query retrieval.

Both adapters resolve provider/model/dimensions through ai.config. Resolution
returns a fresh dictionary; these factories create the library-specific objects.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger()


async def similarity_scores(query: str, texts: list[str], *, scope_id: str, cache_seconds: int,
                            query_embedding=None) -> list[float]:
    """Rank authorized request-local text with the existing embedding adapter/cache."""
    import asyncio
    import hashlib
    import json
    import math

    from app.config import settings
    from app.core.redis import redis_client
    from app.orchestra.ai.config import get_embedding_config

    if not texts:
        return []
    if not scope_id or cache_seconds < 1 or settings.EMBEDDING_BATCH_SIZE < 1:
        raise ValueError('Similarity ranking requires a scope and positive cache/batch limits')
    cfg = get_embedding_config()
    identity = json.dumps({key: cfg[key] for key in ('model', 'dimensions', 'base_url')}, sort_keys=True)
    inputs = [query, *texts]
    keys = [f'embedding:{scope_id}:' + hashlib.sha256((identity + '\n' + text).encode()).hexdigest()
            for text in inputs]
    pending = dict(zip(keys, inputs))
    cached = await redis_client.get_many(list(pending)) if redis_client.redis is not None else {}

    def unit_vector(value):
        if value is None or isinstance(value, (str, bytes, dict)) or len(value) != cfg['dimensions']:
            raise ValueError('Unexpected embedding dimensions')
        vector = [float(number) for number in value]
        if not all(math.isfinite(number) for number in vector):
            raise ValueError('Invalid embedding values')
        length = math.sqrt(sum(number * number for number in vector))
        if not math.isfinite(length) or not length:
            raise ValueError('Empty embedding vector')
        return [number / length for number in vector]

    vectors = {}
    for key, value in cached.items():
        try:
            vectors[key] = unit_vector(value)
        except (TypeError, ValueError):
            continue
    if query_embedding is not None:
        vectors[keys[0]] = unit_vector(query_embedding)
    missing = [key for key in pending if key not in vectors]
    if missing:
        embed = build_chroma_embedding_function(cfg)
        if embed is None:
            raise RuntimeError('Configured embedding provider is unavailable')
        for start in range(0, len(missing), settings.EMBEDDING_BATCH_SIZE):
            batch = missing[start:start + settings.EMBEDDING_BATCH_SIZE]
            values = await asyncio.to_thread(embed, input=[pending[key] for key in batch])
            if values is None or len(values) != len(batch):
                raise ValueError('Unexpected embedding count')
            normalized = {key: unit_vector(value) for key, value in zip(batch, values)}
            vectors.update(normalized)
            if redis_client.redis is not None:
                await redis_client.set_many(normalized, expire=cache_seconds)
    query_vector = vectors[keys[0]]
    return [sum(left * right for left, right in zip(query_vector, vectors[key])) for key in keys[1:]]


# ── Shared factories (write path + read path build from ONE config) ───────────
# Both the ChromaDB write path and the Agno read path must use the same model +
# dimensions or query vectors won't match stored vectors. These build each from
# the central resolver for consistent configured values.

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
        from app.services.ai_usage import estimate_tokens, track_usage

        _t0 = _time.monotonic()
        try:
            vectors = self._inner(input)
        except Exception as error:
            track_usage(kind="embedding", provider=self._provider, model=self._model,
                        latency_ms=int((_time.monotonic() - _t0) * 1000),
                        ok=False, error_type=type(error).__name__)
            raise
        track_usage(
            kind="embedding", provider=self._provider, model=self._model,
            latency_ms=int((_time.monotonic() - _t0) * 1000),
            usage={"prompt_tokens": estimate_tokens("".join(input or [])), "completion_tokens": 0},
            estimated=True, meta={"batch_size": len(input or [])},
        )
        return vectors

    def __getattr__(self, name):
        # Delegate everything else (name(), config, ...) to the inner EF.
        return getattr(self._inner, name)


def build_chroma_embedding_function(cfg=None):
    """Embedding callable used explicitly by VectorStore. None on failure.

    cfg["base_url"] routes through an OpenAI-compatible proxy (OpenRouter) —
    passed as `api_base` here vs `base_url` on the Agno side; same idea, the
    two libraries just name the parameter differently.
    """
    from app.orchestra.ai.config import get_embedding_config
    cfg = cfg or get_embedding_config()
    if not isinstance(cfg.get("api_key"), str) or not cfg["api_key"].strip():
        logger.warning("embedding.configured_credentials_unavailable")
        return None
    try:
        from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
        kwargs = dict(
            api_key=cfg['api_key'],
            model_name=cfg['model'],
            dimensions=cfg['dimensions'],
        )
        if cfg['base_url']:
            kwargs["api_base"] = cfg['base_url']
        return _UsageTrackedEmbeddingFunction(
            OpenAIEmbeddingFunction(**kwargs),
            provider="openrouter" if cfg['base_url'] else "openai", model=cfg['model'],
        )
    except Exception as e:
        logger.warning("embedding.chroma_ef_unavailable", error=str(e))
        return None


def build_agno_embedder(cfg=None):
    """Agno OpenAIEmbedder for the knowledge/read path. None if agno missing."""
    from app.orchestra.ai.config import get_embedding_config
    cfg = cfg or get_embedding_config()
    if not isinstance(cfg.get("api_key"), str) or not cfg["api_key"].strip():
        logger.warning("embedding.configured_credentials_unavailable")
        return None
    try:
        from agno.knowledge.embedder.openai import OpenAIEmbedder
        kwargs = dict(
            id=cfg['model'],
            dimensions=cfg['dimensions'],
            api_key=cfg['api_key'],
        )
        if cfg['base_url']:
            kwargs["base_url"] = cfg['base_url']
        return OpenAIEmbedder(**kwargs)
    except Exception as e:
        logger.warning("embedding.agno_embedder_unavailable", error=str(e))
        return None

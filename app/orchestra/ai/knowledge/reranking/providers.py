"""
Built-in reranker providers. Each is a small plugin registered by name.

Adding a provider here (or anywhere, via @register) makes it selectable through
RERANK_PROVIDER with no change to the knowledge backend.
"""

from __future__ import annotations

from typing import Any

from app.orchestra.ai.knowledge.reranking.base import RerankerConfig
from app.orchestra.ai.knowledge.reranking.registry import register


@register("cohere")
def _build_cohere(cfg: RerankerConfig) -> Any:
    """Cohere hosted reranker. Needs `cohere` + COHERE_API_KEY."""
    # No key → don't build a reranker that would fail on every query. Raising
    # here makes build_reranker() log and degrade to no-rerank (chat still works).
    if not (cfg.api_key and cfg.api_key.strip()):
        raise ValueError("COHERE_API_KEY not set — reranking disabled until a key is provided")
    from agno.knowledge.reranker.cohere import CohereReranker
    kwargs = {"api_key": cfg.api_key.strip(), "top_n": cfg.top_n}
    if cfg.model:
        kwargs["model"] = cfg.model
    return CohereReranker(**kwargs)


@register("sentence_transformer")
def _build_sentence_transformer(cfg: RerankerConfig) -> Any:
    """Local CrossEncoder reranker — no API key. Needs `sentence-transformers`."""
    from agno.knowledge.reranker.sentence_transformer import SentenceTransformerReranker
    kwargs = {"top_n": cfg.top_n}
    if cfg.model:
        kwargs["model"] = cfg.model
    return SentenceTransformerReranker(**kwargs)

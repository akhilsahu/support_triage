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
        return OpenAIEmbeddingFunction(**kwargs)
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

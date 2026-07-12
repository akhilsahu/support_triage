"""
EmbeddingConfig — single source of truth for embedding model + dimensions.

Both the write path (ChromaDB OpenAIEmbeddingFunction) and the read path
(Agno OpenAIEmbedder) build from this, so they can never drift.

Values come from app.config.settings (env-overridable):
    EMBEDDING_MODEL       e.g. text-embedding-3-small | text-embedding-3-large
    EMBEDDING_DIMENSION   1536 (small) | 3072 (large) | shortened
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class EmbeddingConfig:
    model: str
    dimensions: int
    api_key: Optional[str]


def get_embedding_config() -> EmbeddingConfig:
    from app.config import settings
    return EmbeddingConfig(
        model=settings.EMBEDDING_MODEL,
        dimensions=settings.EMBEDDING_DIMENSION,
        api_key=settings.OPENAI_API_KEY,
    )

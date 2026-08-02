"""
EmbeddingConfig — single source of truth for embedding model + dimensions.

Both the write path (ChromaDB OpenAIEmbeddingFunction) and the read path
(Agno OpenAIEmbedder) build from this, so they can never drift.

Values come from app.config.settings (env-overridable):
    EMBEDDING_PROVIDER    openai | openrouter — which endpoint to reach it through
    EMBEDDING_MODEL       e.g. text-embedding-3-small | text-embedding-3-large
    EMBEDDING_DIMENSION   1536 (small) | 3072 (large) | shortened
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


@dataclass(frozen=True)
class EmbeddingConfig:
    model: str
    dimensions: int
    api_key: Optional[str]
    # None = the provider's own default endpoint (OpenAI). Set for any
    # OpenAI-compatible proxy; both the Chroma EF (api_base) and the Agno
    # embedder (base_url) accept it.
    base_url: Optional[str] = None


def get_embedding_config() -> EmbeddingConfig:
    from app.config import settings

    if (settings.EMBEDDING_PROVIDER or "openai").lower() == "openrouter":
        # EMBEDDING_MODEL stays the bare OpenAI id so switching providers never
        # changes which model — and therefore which vector space — you are on.
        # OpenRouter addresses models as "<provider>/<model>", so add the
        # prefix here rather than making every deployment edit the model name
        # (and risk it drifting out of sync with EMBEDDING_DIMENSION).
        model = settings.EMBEDDING_MODEL
        if "/" not in model:
            model = f"openai/{model}"
        return EmbeddingConfig(
            model=model,
            dimensions=settings.EMBEDDING_DIMENSION,
            api_key=settings.OPENROUTER_API_KEY,
            base_url=OPENROUTER_BASE_URL,
        )

    return EmbeddingConfig(
        model=settings.EMBEDDING_MODEL,
        dimensions=settings.EMBEDDING_DIMENSION,
        api_key=settings.OPENAI_API_KEY,
        base_url=None,
    )

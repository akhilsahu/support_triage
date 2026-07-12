"""
EmbeddingService — centralized OpenAI embedding for the RAG write path.

Single source of truth for the embedding model (read from app.config), with
batching and retry. Embeds RAW chunk text (no context prefix) so the stored
vectors stay clean; the enriched display text is stored separately by the
vector store. Query-side embedding (ChromaDB EF / Agno) reads the same config
model, so write and read can never drift.

Synchronous by design — ChromaDB's world is sync, and this avoids the
event-loop pitfalls of the previous asyncio-based embedder.
"""

from __future__ import annotations

import time
from typing import List, Optional

import structlog

from app.config import settings

logger = structlog.get_logger()


class EmbeddingService:
    """Generates embeddings via OpenAI. Batched, with simple exponential backoff."""

    def __init__(self, model: Optional[str] = None, batch_size: Optional[int] = None):
        self.model = model or settings.EMBEDDING_MODEL
        self.batch_size = batch_size or settings.EMBEDDING_BATCH_SIZE
        self._client = None
        logger.info("embedding.ready", model=self.model, batch_size=self.batch_size)

    # ── Public API ────────────────────────────────────────────────────────────

    def embed(self, text: str) -> List[float]:
        return self.embed_batch([text])[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        out: List[List[float]] = []
        for i in range(0, len(texts), self.batch_size):
            out.extend(self._embed_one_batch(texts[i:i + self.batch_size]))
        return out

    @property
    def dimension(self) -> int:
        return settings.EMBEDDING_DIMENSION

    # ── Internals ─────────────────────────────────────────────────────────────

    def _get_client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        return self._client

    def _embed_one_batch(self, batch: List[str], attempts: int = 3) -> List[List[float]]:
        client = self._get_client()
        for attempt in range(1, attempts + 1):
            try:
                resp = client.embeddings.create(model=self.model, input=batch)
                return [d.embedding for d in sorted(resp.data, key=lambda x: x.index)]
            except Exception as e:
                if attempt == attempts:
                    logger.error("embedding.failed", model=self.model, size=len(batch), error=str(e))
                    raise
                wait = 2 ** (attempt - 1)
                logger.warning("embedding.retry", attempt=attempt, wait=wait, error=str(e))
                time.sleep(wait)
        return []  # unreachable — last attempt either returns or raises


# ── Singleton ─────────────────────────────────────────────────────────────────

_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    global _service
    if _service is None:
        _service = EmbeddingService()
    return _service


# ── Shared factories (write path + read path build from ONE config) ───────────
# Both the ChromaDB write path and the Agno read path must use the same model +
# dimensions or query vectors won't match stored vectors. These build each from
# the single EmbeddingConfig so they can never drift.

def build_chroma_embedding_function(cfg=None):
    """OpenAIEmbeddingFunction for the ChromaDB write path. None on failure."""
    from app.orchestra.ai.embedding.config import get_embedding_config
    cfg = cfg or get_embedding_config()
    try:
        from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
        return OpenAIEmbeddingFunction(
            api_key=cfg.api_key,
            model_name=cfg.model,
            dimensions=cfg.dimensions,
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
        return OpenAIEmbedder(
            id=cfg.model,
            dimensions=cfg.dimensions,
            api_key=cfg.api_key,
        )
    except Exception as e:
        logger.warning("embedding.agno_embedder_unavailable", error=str(e))
        return None

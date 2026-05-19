"""
Embedder — OpenAI text-embedding-3-small for the RAG system.

Replaces sentence-transformers to eliminate the PyTorch dependency (~1.5 GB).
Dimension: 1536  Model: text-embedding-3-small
"""

from __future__ import annotations

import asyncio
from typing import List, Optional

import structlog

logger = structlog.get_logger()

OPENAI_EMBED_MODEL = "text-embedding-3-small"
OPENAI_EMBED_DIM   = 1536


class Embedder:
    """Generates embeddings via OpenAI. Sync interface for ChromaDB compatibility."""

    def __init__(self, model_name: str = OPENAI_EMBED_MODEL):
        self.model_name = model_name
        self._dim = OPENAI_EMBED_DIM
        logger.info("Embedder ready", model=self.model_name, dim=self._dim, provider="openai")

    def embed(self, text: str) -> List[float]:
        return asyncio.get_event_loop().run_until_complete(self._async_embed(text))

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return asyncio.get_event_loop().run_until_complete(self._async_embed_batch(texts))

    async def _async_embed(self, text: str) -> List[float]:
        from openai import AsyncOpenAI
        from app.config import settings
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.embeddings.create(model=self.model_name, input=text)
        return resp.data[0].embedding

    async def _async_embed_batch(self, texts: List[str]) -> List[List[float]]:
        from openai import AsyncOpenAI
        from app.config import settings
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.embeddings.create(model=self.model_name, input=texts)
        return [d.embedding for d in sorted(resp.data, key=lambda x: x.index)]

    @property
    def dimension(self) -> int:
        return self._dim


_embedder: Optional[Embedder] = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder

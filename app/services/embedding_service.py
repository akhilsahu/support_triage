"""Embedding service — OpenAI text-embedding-3-small."""

import hashlib
from typing import List, Optional

import structlog

from app.core.redis import redis_client

logger = structlog.get_logger()

OPENAI_EMBED_MODEL = "text-embedding-3-small"
OPENAI_EMBED_DIM   = 1536


class EmbeddingService:
    """Generates embeddings via OpenAI API with Redis caching."""

    def __init__(self):
        self.model_name = OPENAI_EMBED_MODEL
        self.dimension  = OPENAI_EMBED_DIM

    def _cache_key(self, text: str) -> str:
        h = hashlib.md5(text.encode()).hexdigest()
        return f"embedding:openai:{h}"

    async def generate_embedding(self, text: str, use_cache: bool = True) -> List[float]:
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        if use_cache:
            cached = await redis_client.get(self._cache_key(text))
            if cached:
                return cached

        from openai import AsyncOpenAI
        from app.config import settings
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.embeddings.create(model=self.model_name, input=text)
        embedding = resp.data[0].embedding

        if use_cache:
            await redis_client.set(self._cache_key(text), embedding, expire=86400)

        return embedding

    async def generate_embeddings_batch(
        self, texts: List[str], use_cache: bool = True, batch_size: Optional[int] = None
    ) -> List[List[float]]:
        if not texts:
            return []

        from openai import AsyncOpenAI
        from app.config import settings
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        results: List[Optional[List[float]]] = [None] * len(texts)
        to_fetch: List[int] = []

        if use_cache:
            for i, text in enumerate(texts):
                cached = await redis_client.get(self._cache_key(text))
                if cached:
                    results[i] = cached
                else:
                    to_fetch.append(i)
        else:
            to_fetch = list(range(len(texts)))

        if to_fetch:
            batch = [texts[i] for i in to_fetch]
            resp = await client.embeddings.create(model=self.model_name, input=batch)
            for j, idx in enumerate(to_fetch):
                emb = resp.data[j].embedding
                results[idx] = emb
                if use_cache:
                    await redis_client.set(self._cache_key(texts[idx]), emb, expire=86400)

        return results  # type: ignore

    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        import math
        dot = sum(a * b for a, b in zip(vec1, vec2))
        n1  = math.sqrt(sum(a * a for a in vec1))
        n2  = math.sqrt(sum(b * b for b in vec2))
        return dot / (n1 * n2) if n1 and n2 else 0.0

    def get_model_info(self) -> dict:
        return {"model_name": self.model_name, "dimension": self.dimension, "provider": "openai"}


embedding_service = EmbeddingService()

# Made with Bob

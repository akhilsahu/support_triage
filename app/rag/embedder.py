"""
Embedder — thin wrapper around sentence-transformers for the RAG system.

Used by VectorRAGService when generating embeddings outside of ChromaDB's
built-in embedding function (e.g. for scoring, similarity checks).
"""

from __future__ import annotations

from typing import List, Optional
import structlog

logger = structlog.get_logger()


class Embedder:
    """
    Generates dense vector embeddings using sentence-transformers.
    Falls back to a deterministic hash vector if the model fails to load.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._model = None
        self._dim = 384
        self._load()

    def _load(self):
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)
            self._dim = self._model.get_sentence_embedding_dimension()
            logger.info("Embedder ready", model=self.model_name, dim=self._dim)
        except Exception as e:
            logger.warning("Embedder: sentence-transformers unavailable, using hash fallback", error=str(e))

    def embed(self, text: str) -> List[float]:
        """Return a single embedding vector for text."""
        if self._model:
            return self._model.encode(text, show_progress_bar=False).tolist()
        return self._hash_embed(text)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Return embeddings for a list of texts."""
        if self._model:
            return self._model.encode(texts, show_progress_bar=False).tolist()
        return [self._hash_embed(t) for t in texts]

    def _hash_embed(self, text: str) -> List[float]:
        """Deterministic pseudo-embedding from MD5 hash (fallback only)."""
        import hashlib, struct
        h = hashlib.md5(text.encode()).digest()
        floats = [struct.unpack("f", h[i : i + 4])[0] for i in range(0, 16, 4)]
        # pad to self._dim
        repeated = (floats * (self._dim // 4 + 1))[: self._dim]
        norm = sum(x ** 2 for x in repeated) ** 0.5 or 1.0
        return [x / norm for x in repeated]

    @property
    def dimension(self) -> int:
        return self._dim


_embedder: Optional[Embedder] = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder

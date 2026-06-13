"""
RAGFactory — builds the right BaseRAG implementation from config.

Switch via .env:
    RAG_BACKEND=vectorstore   → VectorStoreRAG  (default)
    RAG_BACKEND=agno          → AgnoRAG
    RAG_BACKEND=none          → NullRAG

Adding a new backend:
    1. Subclass BaseRAG in a new file under rag/
    2. Add a branch here
    3. Add RAG_BACKEND=<key> to .env — no other changes needed
"""

from __future__ import annotations

from app.orchestra.ai.core.config import OrchestraConfig
from app.orchestra.ai.rag.base import BaseRAG


def build_rag(cfg: OrchestraConfig) -> BaseRAG:
    """Return the configured RAG backend instance."""
    backend = getattr(cfg, "rag_backend", "vectorstore").lower()

    if not cfg.rag_enabled or backend == "none":
        from app.orchestra.ai.rag.null_rag import NullRAG
        return NullRAG()

    if backend == "agno":
        from app.orchestra.ai.rag.agno_rag import AgnoRAG
        return AgnoRAG(
            chroma_path=cfg.chroma_path,
            chroma_collection=cfg.chroma_collection,
        )

    # Default: vectorstore
    from app.orchestra.ai.rag.vectorstore_rag import VectorStoreRAG
    return VectorStoreRAG()

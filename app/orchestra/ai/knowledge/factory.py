"""
KnowledgeBackendFactory — builds the right BaseKnowledgeBackend from config.

Switch via .env:
    KNOWLEDGE_BACKEND=agno_chroma    → AgnoChromaKnowledgeBackend  (default)
    KNOWLEDGE_BACKEND=none           → NullKnowledgeBackend

Adding a new backend (e.g. agno_pgvector, langchain_pinecone):
    1. Subclass BaseKnowledgeBackend in a new file under knowledge/
    2. Add a branch below — nothing else changes
    3. Set KNOWLEDGE_BACKEND=<key> in .env
"""

from __future__ import annotations

from app.orchestra.ai.core.config import OrchestraConfig
from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend


def build_knowledge_backend(cfg: OrchestraConfig) -> BaseKnowledgeBackend:
    backend = getattr(cfg, "knowledge_backend", "agno_chroma").lower()

    if not cfg.rag_enabled or backend == "none":
        from app.orchestra.ai.knowledge.null import NullKnowledgeBackend
        return NullKnowledgeBackend()

    if backend == "agno_chroma":
        from app.orchestra.ai.knowledge.agno_chroma import AgnoChromaKnowledgeBackend
        return AgnoChromaKnowledgeBackend(
            chroma_path=cfg.chroma_path,
            chroma_collection=cfg.chroma_collection,
            embedding_model=cfg.embedding_model,
        )

    # Future backends:
    # if backend == "agno_pgvector":
    #     from app.orchestra.ai.knowledge.agno_pgvector import AgnoPgVectorKnowledgeBackend
    #     return AgnoPgVectorKnowledgeBackend(db_url=cfg.database_url)
    #
    # if backend == "langchain_pinecone":
    #     from app.orchestra.ai.knowledge.langchain_pinecone import LangChainPineconeBackend
    #     return LangChainPineconeBackend(api_key=cfg.pinecone_api_key, index=cfg.pinecone_index)

    raise ValueError(
        f"Unknown KNOWLEDGE_BACKEND={backend!r}. "
        f"Valid values: agno_chroma, none"
    )

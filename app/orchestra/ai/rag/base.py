"""
BaseRAG — abstract interface for RAG backends.

All implementations must return the same shape so AgnoOrchestrator
doesn't know or care which backend is active.

Switching backends:
    RAG_BACKEND=vectorstore   → VectorStoreRAG  (default, existing ChromaDB)
    RAG_BACKEND=agno          → AgnoRAG         (Agno Knowledge/ChromaDb)
    RAG_BACKEND=none          → NullRAG         (disables RAG entirely)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional

from app.agents.resolved_agent import ResolvedAgent


@dataclass
class RAGResult:
    context:   str              # injected into the message / system prompt
    rag_hit:   bool             # True if any chunks were found
    citations: List[dict]       # [{filename, page, section, score, excerpt}]

    @classmethod
    def empty(cls) -> "RAGResult":
        return cls(context="", rag_hit=False, citations=[])


class BaseRAG(ABC):
    """
    Framework-agnostic RAG interface.

    Subclasses own their vector store connection, embedding function,
    and filter logic. The orchestrator only calls fetch().
    """

    @abstractmethod
    async def fetch(
        self,
        message:  str,
        space_id:   str,
        agents:   List[ResolvedAgent],
        top_k:    Optional[int] = None,
    ) -> RAGResult:
        """
        Retrieve relevant chunks for `message` scoped to `space_id`.

        Args:
            message:  User query (already reformulated if mem0 is active)
            space_id:   str(org.id) UUID — used as client_id filter
            agents:   Active ResolvedAgents — used to scope doc_types and top_k
            top_k:    Override per-agent top_k (None = use agent's own value)

        Returns:
            RAGResult with context text, hit flag, and citation list
        """
        ...

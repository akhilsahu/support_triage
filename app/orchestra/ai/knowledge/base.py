"""
BaseKnowledgeBackend — framework-agnostic interface for knowledge/RAG backends.

Switching backends requires only:
  1. Subclass BaseKnowledgeBackend
  2. Add a branch in factory.py
  3. Set KNOWLEDGE_BACKEND=<key> in .env

Implementations:
  agno_chroma   → Agno Knowledge + ChromaDB   (default)
  null          → RAG disabled

Scoping rules (enforced by every implementation):
  - All queries MUST filter by space_id (stored as "client_id" in ChromaDB metadata
    for backward compatibility with existing indexed documents).
  - doc_ids filter to specific documents within a KB.
  - doc_types filter to categories (builtins like "policy", "product").
  - Never return documents from a different space_id — this is a hard multi-tenancy boundary.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.orchestra.ai.knowledge.bundle import KnowledgeBundle


class BaseKnowledgeBackend(ABC):
    """
    Framework-agnostic knowledge backend.

    Each method returns a KnowledgeBundle — an opaque bag of framework-native
    objects that the AgentFactory attaches to agents. The orchestrator never
    inspects the bundle contents.
    """

    @abstractmethod
    def for_agent(
        self,
        space_id:   str,
        doc_ids:    Optional[List[str]] = None,
        doc_types:  Optional[List[str]] = None,
    ) -> KnowledgeBundle:
        """
        Build a KnowledgeBundle scoped to this agent's accessible documents.

        Args:
            space_id:  UUID of the space — hard filter, always applied.
            doc_ids:   Specific document UUIDs (from linked KnowledgeBases).
                       Takes priority over doc_types when both are provided.
            doc_types: Category-based filter (e.g. ["policy", "product"]).
                       Used for builtin agents that search by category.

        Returns:
            KnowledgeBundle with framework-native knowledge + filter objects.
            Returns KnowledgeBundle.empty() when RAG is disabled or unavailable.
        """
        ...

    @abstractmethod
    def name(self) -> str:
        """Human-readable backend identifier for logging."""
        ...

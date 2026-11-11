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
import re
from typing import List, Optional

from app.orchestra.ai.knowledge.bundle import KnowledgeBundle


def prepare_retrieval_query(message: str, history: list) -> str:
    """Add bounded visitor context for referential queries, not prompt routing.

    This conservative English-language heuristic is not semantic resolution.
    Current questions stay verbatim; assistant claims never become evidence.
    The caller supplies authorized history and may omit greetings/irrelevant turns.
    """
    text = message.casefold().strip()
    follows = re.match(r'^(what about|how about|and |those\b|these\b|which one\b|tell me more|more details)', text)
    refers = re.search(r'\b(it|its|that|them|those|these|first one|second one|former|latter)\b', text)
    if not follows and not refers:
        return message
    prior = next((entry.message for entry in reversed(history)
                  if entry.role == 'user' and isinstance(entry.message, str) and entry.message.strip()), None)
    return f'Previous visitor question: {prior[:500]}\nCurrent question: {message}' if prior else message


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
        space_id:         str,
        doc_ids:          Optional[List[str]] = None,
        doc_types:        Optional[List[str]] = None,
        topics:           Optional[List[str]] = None,
        specific_doc_ids: Optional[List[str]] = None,
        kb_assignments:  Optional[List[dict]] = None,
    ) -> KnowledgeBundle:

        """
        Build a KnowledgeBundle scoped to this agent's accessible documents.

        Args:
            space_id:  UUID of the space — hard filter, always applied.
            doc_ids:   Specific document UUIDs (from linked KnowledgeBases).
                       Takes priority over doc_types when both are provided.
            doc_types: Category-based filter (e.g. ["policy", "product"]).
                       Used for builtin agents that search by category.
            topics:    User-supplied topic slugs. Empty means the whole of the
                       agent's KBs, which is how agents behaved before topics.

        Returns:
            KnowledgeBundle with framework-native knowledge + filter objects.
            Returns KnowledgeBundle.empty() when RAG is disabled or unavailable.
        """
        ...

    def read_chunks(self, space_id: str, doc_id: str, indices: list[int], *, content: bool = True) -> list[dict]:
        """Optional exact reads; unsupported backends expose no continuations."""
        return []

    @abstractmethod
    def name(self) -> str:
        """Human-readable backend identifier for logging."""
        ...

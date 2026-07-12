"""
KnowledgeBundle — opaque bag that AgentFactory receives from the knowledge backend.

The `knowledge` and `filters` fields are framework-native objects:
  - Agno backend   → knowledge=agno.Knowledge,  filters=list[agno.Filter]
  - Null backend   → knowledge=None,             filters=None
  - Future backend → whatever that framework needs

AgentFactory unpacks these and passes them to Agent(knowledge=..., knowledge_filters=...).
The factory is the only place that knows the concrete types.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class KnowledgeBundle:
    """Framework-native knowledge object + filters, ready to attach to an agent."""

    knowledge: Optional[Any] = None   # e.g. agno.Knowledge instance
    filters:   Optional[Any] = None   # e.g. list[agno.EQ] or dict

    @property
    def has_knowledge(self) -> bool:
        return self.knowledge is not None

    @classmethod
    def empty(cls) -> "KnowledgeBundle":
        return cls(knowledge=None, filters=None)

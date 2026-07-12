from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend
from app.orchestra.ai.knowledge.bundle import KnowledgeBundle
from typing import List, Optional


class NullKnowledgeBackend(BaseKnowledgeBackend):
    """No-op backend — disables RAG entirely. Set KNOWLEDGE_BACKEND=none."""

    def for_agent(
        self,
        space_id:  str,
        doc_ids:   Optional[List[str]] = None,
        doc_types: Optional[List[str]] = None,
    ) -> KnowledgeBundle:
        return KnowledgeBundle.empty()

    def name(self) -> str:
        return "null"

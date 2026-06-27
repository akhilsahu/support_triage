"""NullRAG — disables RAG entirely. Set RAG_BACKEND=none."""

from __future__ import annotations
from typing import List, Optional
from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.rag.base import BaseRAG, RAGResult


class NullRAG(BaseRAG):
    async def fetch(self, message: str, space_id: str, agents: List[ResolvedAgent],
                    top_k: Optional[int] = None) -> RAGResult:
        return RAGResult.empty()

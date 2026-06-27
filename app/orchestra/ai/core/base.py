"""
BaseOrchestrator — abstract interface for all orchestrator implementations.

New framework adapters subclass this and implement run() / stream() / close().
The caller (customer.py, run.py) only depends on this interface — never on
Agno or any other framework directly.

Implementations:
    orchestrators/agno.py  → AgnoOrchestrator   (current)
    # orchestrators/crew.py → CrewAIOrchestrator (future)
    # orchestrators/lc.py   → LangChainOrchestrator (future)
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, AsyncIterator, Dict, List

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.core.config import OrchestraConfig


class BaseOrchestrator(ABC):
    """
    Framework-agnostic orchestrator interface.

    Subclasses own their agent lifecycle, session management, and tool wiring.
    The caller only calls run() / stream() / close().
    """

    def __init__(
        self,
        space_id:        str,
        org_name:      str,
        active_agents: List[ResolvedAgent],
        session_id:    str,
        cfg:           OrchestraConfig,
    ):
        self.space_id        = space_id
        self.org_name      = org_name
        self.active_agents = active_agents
        self.session_id    = session_id
        self.cfg           = cfg

    @abstractmethod
    async def run(self, message: str) -> Dict[str, Any]:
        """
        Process one user message, return a structured reply.

        Return keys (drop-in compat with DynamicAgentExecutor):
            reply      str   — agent response text
            agent      str   — slug of agent that handled the request
            intent     str   — detected intent (may equal agent slug)
            rag_hit    bool  — whether knowledge base was consulted
            citations  list  — RAG source references (may be empty)
        """
        ...

    @abstractmethod
    async def stream(self, message: str) -> AsyncGenerator[str, None]:
        """
        Streaming variant — yields reply text chunks.
        For use with FastAPI StreamingResponse / SSE.
        """
        # subclasses use `yield` making this an async generator
        yield  # type: ignore[misc]

    @abstractmethod
    async def close(self) -> None:
        """
        Release session resources.
        Called when the chatbox is closed or session times out.
        """
        ...

    async def warmup(self) -> None:
        """
        Pre-initialise any expensive resources (Team build, model load, etc.)
        so the first run() call has no cold-start cost.

        Default is a no-op. Override in subclasses that cache runners or models.
        Called once by the /session/init endpoint when the chat widget opens.
        """

    def _empty_reply(self, reason: str = "unavailable") -> Dict[str, Any]:
        """Standardised fallback — same shape as a normal reply dict."""
        return {
            "reply":     "I'm unable to process your request right now. Please try again.",
            "agent":     "fallback",
            "intent":    reason,
            "rag_hit":   False,
            "citations": [],
        }

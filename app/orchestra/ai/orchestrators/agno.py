"""
AgnoOrchestrator — Agno implementation of BaseOrchestrator.

Routing strategy:
  1 specialist  → TeamFactory returns a bare Agent (no team overhead).
  2+ specialists → TeamFactory returns Team(mode="route"); the triage leader
                   semantically routes every message to the right specialist.
                   The triage prompt is strict: it MUST always delegate and
                   NEVER answer directly — every message gets routed.

The Team/Agent is cached per space_id at the bot level — built once, reused
across all sessions for that bot. Routing is handled by Agno on every arun().

Usage in customer.py:
    from app.orchestra.ai.orchestrators.agno import AgnoOrchestrator

    executor = AgnoOrchestrator(
        space_id=str(org.id),
        org_name=org.display_name,
        active_agents=active_agents,
        session_id=session_id,
    )
    result = await executor.run(message=req.message)
"""

from __future__ import annotations
from typing import Any, AsyncGenerator, Dict, List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.core.base import BaseOrchestrator
from app.orchestra.ai.core.config import AgnoConfig, build_config
from app.orchestra.ai.rag.base import BaseRAG, RAGResult
from app.orchestra.ai.rag.factory import build_rag
from app.orchestra.ai.session.pool import pool as _pool

logger = structlog.get_logger()


class AgnoOrchestrator(BaseOrchestrator):
    """
    Agno-based orchestrator backed by SessionPool.

    Agent lifecycle:
      First call  → SessionPool builds Team/Agent once, cached by {space_id}:team
      Subsequent  → SessionPool returns cached runner (zero rebuild cost)
      close()     → no-op; eviction is TTL-based or via pool.invalidate_bot_agents()
    """

    def __init__(
        self,
        space_id:      str,
        org_name:      str,
        active_agents: List[ResolvedAgent],
        session_id:    str                           = "new",
        cfg:           Optional[AgnoConfig]          = None,
        mcp_server:    Optional[Any]                 = None,
        skills_map:    Optional[Dict[str, List[Any]]] = None,
    ):
        super().__init__(
            space_id=space_id,
            org_name=org_name,
            active_agents=active_agents,
            session_id=session_id,
            cfg=cfg or build_config(),
        )
        self.mcp_server = mcp_server
        self.skills_map = skills_map or {}
        self._rag: BaseRAG = build_rag(self.cfg)

    async def run(
        self,
        message:          str,
        session_id:       str = "",   # noqa: unused — kept for API compat with DynamicAgentExecutor
        conversation_id:  str = "",   # noqa: unused — kept for API compat
    ) -> Dict[str, Any]:
        """
        Process one message. Returns dict compatible with DynamicAgentExecutor:
            {reply, agent, intent, rag_hit, citations}
        """
        runner = await self._get_runner()
        if not runner:
            return self._empty_reply("no_runner")

        rag = await self._fetch_rag(message)
        augmented = self._augment_message(message, rag.context)

        try:
            response = await runner.arun(augmented, session_id=self.session_id)

            # Agno swallows all exceptions internally and sets response.status = "ERROR"
            # with response.content = str(exception). Check status before trusting content.
            status = getattr(response, "status", None)
            if status is not None and str(status).upper() in ("ERROR", "CANCELLED"):
                logger.error(
                    "agno_orchestrator.runner_error",
                    space_id=self.space_id,
                    status=str(status),
                    detail=getattr(response, "content", ""),
                )
                return self._empty_reply("runner_error")

            reply = (response.content or "") if hasattr(response, "content") else str(response)
            agent = getattr(response, "agent_id", None) or "team"

            logger.info(
                "agno_orchestrator.run_complete",
                space_id=self.space_id,
                agent=agent,
                rag_hit=rag.rag_hit,
                session_id=self.session_id,
            )
            return {
                "reply":     reply,
                "agent":     agent,
                "intent":    agent,
                "rag_hit":   rag.rag_hit,
                "citations": rag.citations,
            }
        except Exception:
            logger.exception("agno_orchestrator.run_error", space_id=self.space_id)
            return self._empty_reply("run_error")

    async def stream(self, message: str) -> AsyncGenerator[str, None]:
        """Yield reply chunks as they arrive (SSE / StreamingResponse)."""
        runner = await self._get_runner()
        if not runner:
            yield self._empty_reply("no_runner")["reply"]
            return

        rag = await self._fetch_rag(message)
        augmented = self._augment_message(message, rag.context)

        try:
            # Agno streams via arun(stream=True) — there is no .astream() method.
            async for chunk in runner.arun(augmented, stream=True, session_id=self.session_id):
                if hasattr(chunk, "content") and chunk.content:
                    yield chunk.content
        except Exception:
            logger.exception("agno_orchestrator.stream_error", space_id=self.space_id)
            yield self._empty_reply("stream_error")["reply"]

    async def warmup(self) -> None:
        """Pre-build and cache the Team so the first message has no cold-start delay."""
        await self._get_runner()

    async def close(self) -> None:
        """
        End a user session.

        The Team/Agent runner is cached at the bot level ({space_id}:team) and
        shared across all sessions — do NOT evict here. Eviction is TTL-based
        or explicit via pool.invalidate_bot_agents() when config changes.
        """

    # ── Private ───────────────────────────────────────────────────────────────

    async def _get_runner(self) -> Optional[Any]:
        """
        Return the cached Team (or bare Agent) for this bot.

        Cache key = {space_id}:team — bot-level, shared across all sessions.
        Passes all active_agents so TeamFactory builds a Team when 2+ specialists.
        """
        return await _pool.get_or_init(
            session_id=f"{self.space_id}:team",
            active_agents=self.active_agents,
            space_id=self.space_id,
            org_name=self.org_name,
            cfg=self.cfg,  # type: ignore[arg-type]  — AgnoConfig extends OrchestraConfig
            mcp_server=self.mcp_server,
            skills_map=self.skills_map,
        )

    async def _fetch_rag(self, message: str) -> RAGResult:
        """Fetch RAG context scoped to this org across all active agents."""
        return await self._rag.fetch(
            message=message,
            space_id=self.space_id,
            agents=self.active_agents,
        )

    def _augment_message(self, message: str, rag_context: str) -> str:
        """Inject RAG context into the message before routing."""
        if not rag_context:
            return message
        return (
            f"{message}\n\n"
            "KNOWLEDGE BASE CONTEXT (use ONLY this to answer):\n"
            f"{rag_context}\n\n"
            "CRITICAL: Base your answer solely on the KNOWLEDGE BASE CONTEXT above. "
            "Do not use outside knowledge. If the context does not contain enough "
            "information, say so and suggest contacting support."
        )

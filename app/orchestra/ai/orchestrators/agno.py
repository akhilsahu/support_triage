"""
AgnoOrchestrator — Agno implementation backed by SessionPool.

Lifecycle:
  warmup()  — called once by /session/init; builds Team, caches by {space_id}:team
  run()     — gets cached Team, calls arun(), returns structured dict
  stream()  — gets cached Team, calls arun(stream=True), yields text chunks

Singletons (module-level, built once at first import):
  _cfg               — AgnoConfig from .env
  _knowledge_backend — ChromaDB Knowledge instance

Team/Agent (per-space, SessionPool):
  Built once on first warmup/run for a space, reused for all sessions.
  Session history is isolated by session_id inside Agno, not by Team instance.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.core.config import AgnoConfig, build_config
from app.orchestra.ai.knowledge import build_knowledge_backend
from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend
from app.orchestra.ai.session.pool import pool as _pool

logger = structlog.get_logger()

# ── Module-level singletons ───────────────────────────────────────────────────

_cfg: Optional[AgnoConfig] = None
_knowledge_backend: Optional[BaseKnowledgeBackend] = None


def _get_cfg() -> AgnoConfig:
    global _cfg
    if _cfg is None:
        _cfg = build_config()
    return _cfg


def _get_knowledge_backend() -> BaseKnowledgeBackend:
    global _knowledge_backend
    if _knowledge_backend is None:
        _knowledge_backend = build_knowledge_backend(_get_cfg())
    return _knowledge_backend


def _citation_from_chunk(chunk: Any, seen: set, out: List[Dict[str, Any]]) -> None:
    """Append a citation dict for one retrieved chunk, de-duped by doc_id:page."""
    if not isinstance(chunk, dict):
        return
    meta   = chunk.get("meta_data") or {}
    doc_id = meta.get("doc_id") or ""
    page   = meta.get("page") or 1
    key    = f"{doc_id}:{page}"
    if key in seen:
        return
    seen.add(key)
    out.append({
        "filename": meta.get("filename") or meta.get("doc_name") or doc_id,
        "page":     page,
        "section":  meta.get("section", ""),
        "score":    meta.get("rrf_score") or chunk.get("score", 0.0),
        "excerpt":  (chunk.get("content") or "")[:300],
        "doc_id":   doc_id,
        "kb_name":  meta.get("kb_name", ""),
    })


def _extract_citations(response: Any) -> List[Dict[str, Any]]:
    """
    Collect retrieved chunks as citations from two Agno sources:

      1. response.references — native references from add_knowledge_to_context
         (traditional RAG injection). Each MessageReferences.references is a
         list of {content, meta_data} dicts.
      2. tool messages — role=tool, tool_name=search_knowledge_base, from the
         agentic search_knowledge tool (JSON list in message content).

    Both shapes share {content, meta_data}. De-duped across sources.
    """
    import json as _json

    seen: set = set()
    citations: List[Dict[str, Any]] = []

    # 1) Native references (add_knowledge_to_context)
    for mr in getattr(response, "references", None) or []:
        for chunk in (getattr(mr, "references", None) or []):
            _citation_from_chunk(chunk, seen, citations)

    # 2) Agentic search_knowledge tool results
    for msg in (getattr(response, "messages", None) or []):
        if getattr(msg, "role", "") != "tool":
            continue
        if getattr(msg, "tool_name", "") != "search_knowledge_base":
            continue
        raw = getattr(msg, "content", "") or ""
        try:
            chunks = _json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            continue
        if isinstance(chunks, list):
            for chunk in chunks:
                _citation_from_chunk(chunk, seen, citations)

    return citations


def _empty(reason: str) -> Dict[str, Any]:
    return {
        "reply":     "I'm unable to process your request right now. Please try again.",
        "agent":     "fallback",
        "intent":    reason,
        "rag_hit":   False,
        "citations": [],
    }


# ── Orchestrator ──────────────────────────────────────────────────────────────

class AgnoOrchestrator:
    """
    Lightweight per-request wrapper. All heavy state lives in singletons + pool.

    mcp_server / skills_map are reserved for future MCP tool integration.
    """

    def __init__(
        self,
        space_id:      str,
        org_name:      str,
        active_agents: List[ResolvedAgent],
        session_id:    str                            = "new",
        cfg:           Optional[AgnoConfig]           = None,   # override for tests
        mcp_server:    Optional[Any]                  = None,   # future MCP integration
        skills_map:    Optional[Dict[str, List[Any]]] = None,   # future skills integration
    ):
        self.space_id      = space_id
        self.org_name      = org_name
        self.active_agents = active_agents
        self.session_id    = session_id
        self._cfg_override = cfg
        self.mcp_server    = mcp_server
        self.skills_map    = skills_map or {}
        # Structured result of the last stream() — agent/rag_hit/citations that
        # the text-only SSE stream can't return inline. Read after the generator
        # is exhausted (per-request instance, so no cross-request bleed).
        self.last_result: Optional[Dict[str, Any]] = None

    async def run(self, message: str) -> Dict[str, Any]:
        runner = await self._runner()
        if not runner:
            return _empty("no_runner")

        try:
            # session_id threads the conversation; user_id scopes memory.
            # Per project decision, both are the ChatSession id.
            response = await runner.arun(
                message, session_id=self.session_id, user_id=self.session_id
            )

            # Agno swallows exceptions internally — status="ERROR" instead of raising
            status = getattr(response, "status", None)
            if status and str(status).upper() in ("ERROR", "CANCELLED"):
                logger.error("agno.runner_error", space_id=self.space_id,
                             status=str(status), detail=getattr(response, "content", ""))
                return _empty("runner_error")

            reply     = (response.content or "") if hasattr(response, "content") else str(response)
            agent     = getattr(response, "agent_id", None) or "team"

            citations = _extract_citations(response)
            rag_hit   = len(citations) > 0
            logger.info("agno.run", space_id=self.space_id, agent=agent,
                        rag_hit=rag_hit, citations=len(citations), session_id=self.session_id)
            return {"reply": reply, "agent": agent, "intent": agent,
                    "rag_hit": rag_hit, "citations": citations}

        except Exception:
            logger.exception("agno.run_error", space_id=self.space_id)
            return _empty("run_error")

    async def stream(self, message: str) -> AsyncGenerator[str, None]:
        runner = await self._runner()
        if not runner:
            yield _empty("no_runner")["reply"]
            return

        self.last_result = None
        final = None
        try:
            async for ev in runner.arun(
                message, stream=True, session_id=self.session_id, user_id=self.session_id
            ):
                etype = getattr(ev, "event", "")
                # RunContent = incremental delta → stream to the client.
                if etype == "RunContent":
                    content = getattr(ev, "content", None)
                    if content:
                        yield content
                # RunCompleted = final event → carries full content + references
                # + agent_id. Capture (do NOT yield, else the whole reply repeats).
                elif etype == "RunCompleted":
                    final = ev

            if final is not None:
                citations = _extract_citations(final)
                agent = getattr(final, "agent_id", None) or "team"
                self.last_result = {
                    "reply":     getattr(final, "content", "") or "",
                    "agent":     agent,
                    "intent":    agent,
                    "rag_hit":   len(citations) > 0,
                    "citations": citations,
                }
                logger.info("agno.stream", space_id=self.space_id, agent=agent,
                            rag_hit=self.last_result["rag_hit"],
                            citations=len(citations), session_id=self.session_id)
        except Exception:
            logger.exception("agno.stream_error", space_id=self.space_id)
            yield _empty("stream_error")["reply"]

    async def warmup(self) -> None:
        """Pre-build and cache the Team so the first message has no cold-start delay."""
        await self._runner()

    # ── Private ───────────────────────────────────────────────────────────────

    async def _runner(self) -> Optional[Any]:
        """Pool lookup — returns cached Team or builds it once on first call."""
        return await _pool.get_or_init(
            session_id=f"{self.space_id}:team",
            active_agents=self.active_agents,
            space_id=self.space_id,
            org_name=self.org_name,
            cfg=self._cfg_override or _get_cfg(),
            mcp_server=self.mcp_server,
            skills_map=self.skills_map,
            knowledge_backend=_get_knowledge_backend(),
        )

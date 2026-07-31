"""
AgnoOrchestrator — Agno implementation backed by SessionPool.

This class is a thin wrapper: it holds no conversation state and does no
routing. Its whole job is to fetch the runner (a Team, or a single Agent when
the chatbot has one specialist), call it, and normalise what comes back.

Lifecycle:
  warmup()  — called once by /session/init; builds the runner and caches it
  run()     — gets the cached runner, calls arun(), returns a structured dict
  stream()  — gets the cached runner, calls arun(stream=True), yields text

Both run() and stream() return the same seven keys, built by _result():
  {reply, agent, intent, rag_hit, citations, clarify, blocks}
stream() cannot return them inline (it yields plain text), so it stashes them on
self.last_result for the caller to read once the generator is exhausted.

`clarify` is non-None when the run paused on UserFeedbackTools.ask_user instead
of answering — see resume() and docs/structured-response-rendering-plan.md.
`self.pending` carries the serialized requirement the caller must persist
(ChatSession.pending_run_id/pending_requirement) to resume() on the next
message; it is None whenever the run answered normally.

`blocks` are table/card/tabs visuals a specialist queued via RenderTools
(tools/render_tools.py) — table/card/tabs objects for
ui/src/renderengine/chatblocks to render, always empty on a paused run.

Singletons (module-level, built once at first import):
  _cfg               — AgnoConfig from .env
  _knowledge_backend — ChromaDB Knowledge instance

Runner (per chatbot, cached in SessionPool):
  Built once per {space_id}:{chatbot_id} and reused for every session. Agno
  isolates conversation history by session_id internally, so one shared runner
  serving many customers is safe.
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

    On the Team path neither lives on the response itself: the leader delegates
    and only the MEMBER searched, so its retrieval sits in member_responses.
    Recursing over those is what keeps citations working for multi-agent
    chatbots — without it they always came back empty.
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

    # 3) Team path — the member that answered did the retrieving.
    for member in (getattr(response, "member_responses", None) or []):
        for cite in _extract_citations(member):
            key = f"{cite['doc_id']}:{cite['page']}"
            if key not in seen:
                seen.add(key)
                citations.append(cite)

    return citations


def _as_dict(x: Any) -> Dict[str, Any]:
    """Normalise a tool-call argument that may arrive as a dict OR as the
    Pydantic model Agno parsed it into (CardItem/TabItem — see render_tools.py)."""
    if isinstance(x, dict):
        return x
    if hasattr(x, "model_dump"):
        return x.model_dump()
    return dict(x) if x else {}


def _extract_blocks(response: Any) -> List[Dict[str, Any]]:
    """
    Read back the structured blocks a specialist queued via RenderTools
    (render_table/render_cards/render_tabs), in call order.

    Unlike _extract_citations, which reads a tool's RETURN value, this reads
    the tool's ARGUMENTS — for these tools the payload IS the call; the return
    value is a throwaway confirmation string (see tools/render_tools.py). Same
    trace Agno already logs for every tool call.

    render_cards can queue several cards in one call; each becomes its own
    "card" block (frontend renders one card per block) — only the first
    carries the group's title, so it doesn't repeat above every card.
    """
    blocks: List[Dict[str, Any]] = []

    for msg in (getattr(response, "messages", None) or []):
        if getattr(msg, "role", "") != "tool":
            continue
        name = getattr(msg, "tool_name", "")
        args = getattr(msg, "tool_args", None) or {}

        if name == "render_table":
            blocks.append({
                "block_type": "table",
                "title":      args.get("title") or None,
                "content":    {"columns": args.get("columns") or [], "rows": args.get("rows") or []},
            })
        elif name == "render_cards":
            for i, item in enumerate(args.get("items") or []):
                item = _as_dict(item)
                blocks.append({
                    "block_type": "card",
                    "title":      (args.get("title") or None) if i == 0 else None,
                    "content":    {"heading": item.get("heading", ""), "value": item.get("value"), "body": item.get("body", "")},
                })
        elif name == "render_tabs":
            tabs = [_as_dict(t) for t in (args.get("tabs") or [])]
            blocks.append({
                "block_type": "tabs",
                "title":      args.get("title") or None,
                "content":    {"tabs": [{"label": t.get("label", ""), "body": t.get("body", "")} for t in tabs]},
            })

    # Team path — same reasoning as citations: the member made the call.
    for member in (getattr(response, "member_responses", None) or []):
        blocks.extend(_extract_blocks(member))

    return blocks


def _run_error_status(response: Any) -> Optional[str]:
    """
    "ERROR"/"CANCELLED" when Agno swallowed an exception into response.status
    instead of raising, else None.

    response.status is a RunStatus ENUM, not a plain string. Enum.__str__
    returns "RunStatus.error" (the member's qualified name), NOT its value —
    only `.value` gives "ERROR". A previous version of this check compared
    str(status).upper() directly, which produced "RUNSTATUS.ERROR" and never
    matched anything: every internal Agno error (auth failures, a model
    rejecting an unsupported param, rate limits — anything that sets status
    instead of raising) was silently falling through and being persisted as
    the customer-facing reply, with no exception and no error log.
    """
    status = getattr(response, "status", None)
    if status is None:
        return None
    value = getattr(status, "value", status)
    return str(value).upper() if str(value).upper() in ("ERROR", "CANCELLED") else None


def _empty(reason: str) -> Dict[str, Any]:
    return {
        "reply":     "I'm unable to process your request right now. Please try again.",
        "agent":     "fallback",
        "intent":    reason,
        "rag_hit":   False,
        "citations": [],
        "clarify":   None,
        "blocks":    [],
    }


def _extract_clarify(response: Any) -> Optional[Dict[str, Any]]:
    """
    If the run paused on UserFeedbackTools.ask_user, return the question in the
    shape CustomerChatResponse.clarify expects (question/header/options/
    multi_select). None for a normal, unpaused response.

    Only the first unresolved user-feedback question is surfaced. ask_user
    technically accepts a list of questions per call, but ASK_USER_INSTRUCTIONS
    (see prompts.py) directs the model to ask exactly one — if it ever ignores
    that and asks two, the second is simply left unresolved and re-surfaces as
    its own clarify on the next turn once the first is answered, rather than
    silently dropped.
    """
    if not getattr(response, "is_paused", False):
        return None
    for req in getattr(response, "active_requirements", None) or []:
        if not req.needs_user_feedback:
            continue
        schema = req.user_feedback_schema or []
        if not schema:
            continue
        q = schema[0]
        return {
            "question":     q.question,
            "header":       q.header or "",
            "options":      [opt.label for opt in (q.options or [])],
            "multi_select": bool(q.multi_select),
        }
    return None


def _serialize_pending(response: Any) -> Optional[Dict[str, Any]]:
    """
    Requirement state to persist on ChatSession so the NEXT HTTP request — a new
    orchestrator instance with no memory of this run's Python objects — can
    resume it. None when the run didn't pause.
    """
    if not getattr(response, "is_paused", False):
        return None
    reqs = [
        req.to_dict()
        for req in (getattr(response, "active_requirements", None) or [])
        if req.needs_user_feedback
    ]
    if not reqs:
        return None
    return {"run_id": response.run_id, "requirements": reqs}


def _result(response: Any) -> Dict[str, Any]:
    """
    Shape an Agno response into the dict every executor returns.

    Shared by run() and resume(): a resumed run's response has the same shape as
    a fresh one. `stream()` also uses this for its final event.

    `agent` is the member that answered, or "team" when the leader answered
    without delegating. `intent` repeats it — the API schema has both fields and
    the agno path has no separate notion of intent.

    When the run paused, `response.content` is Agno's internal placeholder
    ("I have tools to execute, but I need user input.") — that must never reach
    a customer. `reply` becomes the clarifying question text instead, so the
    persisted transcript reads as a normal assistant message asking a normal
    question, per the decision in docs/structured-response-rendering-plan.md.
    """
    clarify   = _extract_clarify(response)
    citations = _extract_citations(response)
    # Paused runs skip blocks too — nothing was rendered before the pause hit,
    # and a stale table from a half-finished turn would be confusing next to
    # a clarifying question.
    blocks    = [] if clarify else _extract_blocks(response)
    agent     = getattr(response, "agent_id", None) or "team"
    reply     = clarify["question"] if clarify else (getattr(response, "content", "") or "")
    return {
        "reply":     reply,
        "agent":     agent,
        "intent":    agent,
        "rag_hit":   bool(citations),
        "citations": citations,
        "clarify":   clarify,
        "blocks":    blocks,
    }


# ── Orchestrator ──────────────────────────────────────────────────────────────

class AgnoOrchestrator:
    """
    Lightweight per-request wrapper. All heavy state lives in singletons + pool.

    active_agents are the agents that ANSWER customers; `leader` is the triage
    agent, which does not answer — it configures the Team leader that routes
    between them. Both are passed straight through to the pool, which builds the
    runner once and caches it.

    mcp_server / skills_map are reserved for future MCP tool integration.
    """

    def __init__(
        self,
        space_id:      str,
        org_name:      str,
        active_agents: List[ResolvedAgent],
        session_id:    str                            = "new",
        chatbot_id:    str                            = "",     # scopes the pooled Team
        cfg:           Optional[AgnoConfig]           = None,   # override for tests
        mcp_server:    Optional[Any]                  = None,   # future MCP integration
        skills_map:    Optional[Dict[str, List[Any]]] = None,   # future skills integration
        leader:        Optional[ResolvedAgent]        = None,   # triage → configures the Team
    ):
        self.leader        = leader
        self.space_id      = space_id
        self.chatbot_id    = chatbot_id
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
        # Set by run()/resume() when the run paused on ask_user — the caller
        # (customer.py) persists this on ChatSession so the next request can
        # resume(). None after a run that answered normally.
        self.pending: Optional[Dict[str, Any]] = None

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
            error_status = _run_error_status(response)
            if error_status:
                logger.error("agno.runner_error", space_id=self.space_id,
                             status=error_status, detail=getattr(response, "content", ""))
                return _empty("runner_error")

            result = _result(response)
            self.pending = _serialize_pending(response)
            logger.info("agno.run", space_id=self.space_id, agent=result["agent"],
                        rag_hit=result["rag_hit"], citations=len(result["citations"]),
                        paused=bool(self.pending), session_id=self.session_id)
            return result

        except Exception:
            logger.exception("agno.run_error", space_id=self.space_id)
            return _empty("run_error")

    async def resume(self, run_id: str, requirements: List[Dict[str, Any]], answer: str) -> Dict[str, Any]:
        """
        Continue a run that previously paused on ask_user, feeding it the
        customer's answer to the pending question.

        `requirements` is exactly what run()/resume() serialized into
        ChatSession.pending_requirement via _serialize_pending() — rebuilt here
        because a new HTTP request means a new orchestrator instance with no
        memory of the original RunRequirement objects.
        """
        runner = await self._runner()
        if not runner:
            return _empty("no_runner")

        try:
            from agno.run.requirement import RunRequirement

            rebuilt = [RunRequirement.from_dict(r) for r in requirements]
            for req in rebuilt:
                if not (req.needs_user_feedback and req.user_feedback_schema):
                    continue
                question = req.user_feedback_schema[0]
                # Multi-select questions arrive as one customer message with the
                # picked labels comma-joined (see CustomerChat.tsx) — split back
                # out. Single-select/free-text is the whole message as one answer.
                selections = (
                    [s.strip() for s in answer.split(",") if s.strip()]
                    if question.multi_select else [answer]
                )
                req.provide_user_feedback({question.question: selections})

            response = await runner.acontinue_run(
                run_id=run_id, session_id=self.session_id, requirements=rebuilt,
            )

            error_status = _run_error_status(response)
            if error_status:
                logger.error("agno.resume_error", space_id=self.space_id,
                             status=error_status, detail=getattr(response, "content", ""))
                return _empty("runner_error")

            result = _result(response)
            self.pending = _serialize_pending(response)
            logger.info("agno.resume", space_id=self.space_id, agent=result["agent"],
                        rag_hit=result["rag_hit"], citations=len(result["citations"]),
                        paused_again=bool(self.pending), session_id=self.session_id)
            return result

        except Exception:
            logger.exception("agno.resume_error", space_id=self.space_id)
            return _empty("resume_error")

    async def stream(self, message: str) -> AsyncGenerator[str, None]:
        runner = await self._runner()
        if not runner:
            yield _empty("no_runner")["reply"]
            return

        self.last_result = None
        final = None
        try:
            # yield_run_output=True appends one final RunOutput after the deltas.
            # Without it agno emits RunContent only, so there is nothing carrying
            # references/agent_id and every streamed reply was logged with no
            # citations and agent="team".
            async for ev in runner.arun(
                message, stream=True, yield_run_output=True,
                session_id=self.session_id, user_id=self.session_id
            ):
                # Everything here matches on CLASS NAME, not ev.event, because
                # ev.event is not stable across runner types: an Agent labels a
                # text delta "RunContent" but a Team labels the same class
                # "TeamRunContent", and the final output has event=None.
                cls = type(ev).__name__

                # Incremental text delta → stream it to the client.
                if cls == "RunContentEvent":
                    content = getattr(ev, "content", None)
                    if content:
                        yield content
                # The run's result: full content + references + agent_id.
                # Capture it, do NOT yield it, or the whole reply repeats.
                elif cls in ("RunOutput", "TeamRunOutput"):
                    final = ev

            if final is not None:
                error_status = _run_error_status(final)
                if error_status:
                    # Same swallowed-error case as run()/resume() (see
                    # _run_error_status) — whatever text already streamed to the
                    # client stands (SSE can't retract sent chunks), but
                    # last_result must not carry the raw error text forward into
                    # what customer.py persists as this turn's reply.
                    logger.error("agno.stream_error", space_id=self.space_id,
                                 status=error_status, detail=getattr(final, "content", ""))
                    self.last_result = _empty("runner_error")
                else:
                    self.last_result = _result(final)
                    logger.info("agno.stream", space_id=self.space_id,
                                agent=self.last_result["agent"],
                                rag_hit=self.last_result["rag_hit"],
                                citations=len(self.last_result["citations"]),
                                session_id=self.session_id)
        except Exception:
            logger.exception("agno.stream_error", space_id=self.space_id)
            yield _empty("stream_error")["reply"]

    async def warmup(self) -> None:
        """Pre-build and cache the Team so the first message has no cold-start delay."""
        await self._runner()

    # ── Private ───────────────────────────────────────────────────────────────

    async def _runner(self) -> Optional[Any]:
        """Pool lookup — returns cached Team or builds it once on first call.

        Keyed by chatbot, not just space: two chatbots in one space have
        different agent sets, and a space-only key meant whichever chatbot was
        used first served every chatbot in that space from its own agents —
        one brand answering with another brand's documents. Matches the
        agent-list cache convention in session/pool.py.
        """
        return await _pool.get_or_init(
            session_id=f"{self.space_id}:{self.chatbot_id or 'default'}:team",
            active_agents=self.active_agents,
            space_id=self.space_id,
            org_name=self.org_name,
            cfg=self._cfg_override or _get_cfg(),
            mcp_server=self.mcp_server,
            skills_map=self.skills_map,
            knowledge_backend=_get_knowledge_backend(),
            leader=self.leader,
        )

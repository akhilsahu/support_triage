"""
Public customer-facing endpoints.

POST /api/chat/{slug}                         — chat against a brand's active agents
GET  /api/chat/{slug}/suggestions             — suggestion chips
GET  /api/chat/{slug}/session/{id}            — restore session history
POST /api/chat/{slug}/session/{session_id}/close — chatbox unmount signal
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

import structlog
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.space import (
    Space, ConversationLog,
    BuiltinAgentCatalog, SpaceBuiltinAgentConfig, CustomAgent, ChatbotCustomAgent,
)
from app.models.knowledge_base import AgentKnowledgeBase, KnowledgeBase
from app.models.chat import MessageThought
from app.models.chatbot import Chatbot
from app.orchestra.ai.contracts import (
    ConversationEventData,
    ConversationEventType,
    ConversationExecutionContext,
)
from app.orchestra.ai.customer_runtime import build_customer_executor
from app.services.conversation_events import record_conversation_event

logger = structlog.get_logger()
router = APIRouter(tags=["Customer"])

# CORS headers applied to every /api/chat/ response so cross-origin widget
# embeds and external sites can reach these public endpoints.
_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    # Authorization carries the signed-in customer's token (see chatbot_auth.py).
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


# ── Request / Response ────────────────────────────────────────────────────────

class CustomerChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None


class ClarifyRequest(BaseModel):
    question: str
    header: str
    options: List[str] = []
    multi_select: bool = False


class CustomerChatResponse(BaseModel):
    reply: str
    agent: str
    intent: str
    session_id: str
    rag_hit: bool
    response_ms: int
    citations: List[dict] = []
    message_id: Optional[str] = None
    # Set when the agent paused mid-turn to ask the customer something instead
    # of answering (see agno.py's ask_user pause/resume). The customer's pick —
    # or typed answer — is sent back through the normal send() path as an
    # ordinary message; see docs/structured-response-rendering-plan.md.
    clarify: Optional[ClarifyRequest] = None
    # Structured table/card/tabs the agent queued via RenderTools (see
    # tools/render_tools.py). Loosely typed like citations -- shape matches
    # ui/src/renderengine/chatblocks's ChatBlock.
    blocks: List[dict] = []
    # The chain-of-thought behind this reply, when the model produced one
    # (e.g. a reasoning model). Persisted to message_thoughts, never into the
    # transcript message text. Streamed clients get it live as separate
    # "reasoning" SSE events; this field carries it for non-streaming clients.
    reasoning: Optional[str] = None


class SessionInitResponse(BaseModel):
    session_id: str


class FeedbackRequest(BaseModel):
    message_id: str
    rating: str   # "up" | "down"



# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_brand(slug: str, chatbot_slug: Optional[str] = None):
    """
    Return (Space, Chatbot, db) for slug.

    chatbot_slug selects a specific chatbot within the space; when omitted (or
    unknown) it falls back to the default chatbot so old /{slug} links and
    unrecognised bot slugs keep working. Raises 404/503 if nothing resolves.
    """
    from app.core.database import AsyncSessionLocal
    db = AsyncSessionLocal()
    result = await db.execute(
        select(Space).where(Space.slug == slug, Space.active == True)
    )
    org = result.scalar_one_or_none()
    if not org:
        await db.close()
        raise HTTPException(404, f"Brand '{slug}' not found.")

    chatbot = None
    if chatbot_slug:
        cb_result = await db.execute(
            select(Chatbot).where(
                Chatbot.space_id == org.id,
                Chatbot.slug == chatbot_slug,
                Chatbot.active == True,
            )
        )
        chatbot = cb_result.scalar_one_or_none()

    if chatbot is None:
        cb_result = await db.execute(
            select(Chatbot).where(
                Chatbot.space_id == org.id,
                Chatbot.is_default == True,
                Chatbot.active == True,
            )
        )
        chatbot = cb_result.scalar_one_or_none()

    if not chatbot:
        await db.close()
        raise HTTPException(503, f"No active chatbot configured for '{slug}'.")

    return org, chatbot, db


async def _get_active_agents_cached(db: AsyncSession, chatbot_id: uuid.UUID, space_id: str) -> list:
    """
    Return active agents for a chatbot, using the SessionPool agent cache.

    Cache key is "{space_id}:{chatbot_id}" so each chatbot in a space keeps its
    own agent set. First call per chatbot hits the DB (2 queries) and caches;
    subsequent calls within the TTL return from cache. Busted when agent config
    changes via pool.invalidate_bot_agents(space_id) (clears all bots in the space).
    """
    from app.orchestra.ai.session.pool import pool as _pool
    cache_key = f"{space_id}:{chatbot_id}"
    cached = _pool.get_agents(cache_key)
    if cached is not None:
        return cached
    agents = await _get_active_agents(db, chatbot_id)
    if agents:
        _pool.set_agents(cache_key, agents)
    return agents


async def _get_triage_agent_cached(db: AsyncSession, chatbot_id: uuid.UUID, space_id: str):
    """
    Return this chatbot's triage agent, or None.

    Fetched separately from _get_active_agents because it is not an agent that
    answers customers — it configures the Team leader. Cached under the same
    "{space_id}:" prefix so invalidate_bot_agents clears it alongside the
    agent list.
    """
    from app.orchestra.ai.session.pool import pool as _pool
    cache_key = f"{space_id}:{chatbot_id}:triage"
    cached = _pool.get_agents(cache_key)
    if cached is not None:
        return cached[0] if cached else None

    from app.agents.resolved_agent import ResolvedAgent
    from sqlalchemy.orm import selectinload

    res = await db.execute(
        select(SpaceBuiltinAgentConfig)
        .options(selectinload(SpaceBuiltinAgentConfig.catalog))
        .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
        .where(
            SpaceBuiltinAgentConfig.chatbot_id == chatbot_id,
            SpaceBuiltinAgentConfig.enabled == True,
            BuiltinAgentCatalog.platform_enabled == True,
            BuiltinAgentCatalog.agent_type == "triage",
        )
    )
    cfg = res.scalars().first()
    triage = ResolvedAgent.from_builtin(cfg) if cfg else None
    _pool.set_agents(cache_key, [triage] if triage else [])
    return triage


async def _get_active_agents(db: AsyncSession, chatbot_id: uuid.UUID) -> list:
    """Return resolved active agents (builtins + custom) for a chatbot."""
    from sqlalchemy.orm import selectinload
    from app.agents.resolved_agent import ResolvedAgent

    builtin_res = await db.execute(
        select(SpaceBuiltinAgentConfig)
        .options(selectinload(SpaceBuiltinAgentConfig.catalog))
        .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
        .where(
            SpaceBuiltinAgentConfig.chatbot_id == chatbot_id,
            BuiltinAgentCatalog.platform_enabled == True,
            SpaceBuiltinAgentConfig.enabled == True,
            # Triage is excluded deliberately: this list is "agents that answer
            # customers", and triage is not one — it is the Team leader, which in
            # Agno is the Team object itself (model + instructions), never a
            # member. Including it made TeamFactory both use it as leader AND
            # build it as a member, so it ran twice per message.
            #
            # The list is also consumed by presentation code that would otherwise
            # advertise "Triage" to customers — homepage sections (api/space.py)
            # and suggestion chips (api/v1/chatbots.py). Wire a triage leader via
            # TeamFactory.build(leader=...) instead of relaxing this filter.
            BuiltinAgentCatalog.agent_type != "triage",
        )
    )
    builtin_agents = [ResolvedAgent.from_builtin(cfg) for cfg in builtin_res.scalars().all()]

    custom_res = await db.execute(
        select(CustomAgent)
        .options(
            selectinload(CustomAgent.knowledge_bases)
            .selectinload(AgentKnowledgeBase.kb)
            .selectinload(KnowledgeBase.items)
        )
        .join(ChatbotCustomAgent, ChatbotCustomAgent.agent_id == CustomAgent.id)
        .where(ChatbotCustomAgent.chatbot_id == chatbot_id, CustomAgent.active == True)
    )
    custom_agents = [ResolvedAgent.from_custom(ca) for ca in custom_res.scalars().all()]

    return builtin_agents + custom_agents


# ── Internal chat helpers ─────────────────────────────────────────────────────

async def _handle_human_session(
    db: AsyncSession,
    org: Space,
    chatbot: Chatbot,
    session_id: str,
    message: str,
) -> Optional[CustomerChatResponse]:
    """
    If this session has been handed off to a human, log the customer message,
    broadcast it to staff via SSE, and return an empty AI response.
    Returns None when AI should proceed normally.
    """
    from app.models.chat import ChatSession

    try:
        sess_result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == uuid.UUID(session_id),
                ChatSession.space_id == org.id,
            )
        )
        sess = sess_result.scalar_one_or_none()
    except ValueError:
        return None

    if not sess:
        return None

    is_human = sess.ai_disabled or sess.status in ("escalated", "queued", "active")
    if not is_human:
        return None

    # Ensure flag is persisted for future requests
    if not sess.ai_disabled:
        sess.ai_disabled = True

    db.add(ConversationLog(
        space_id=org.id,
        chatbot_id=chatbot.id,
        session_id=session_id,
        role="user",
        message=message,
        agent_slug="human",
        timestamp=datetime.utcnow(),
    ))
    sess.message_count = (sess.message_count or 0) + 1
    sess.last_message_at = datetime.utcnow()
    await db.commit()

    # Bust Redis cache so session restore always gets fresh messages
    from app.core.redis import redis_client as _rc
    from app.api.v1.chat_sessions import _history_key
    await _rc.delete(_history_key(session_id))

    # Push to staff inbox via SSE
    from app.services.inbox import sse_manager
    from app.services.inbox.sse_manager import _staff_connections
    logger.info("sse.broadcast_customer_message",
        space_id=str(org.id), session_id=session_id,
        connected_staff=list(_staff_connections.keys()),
    )
    await sse_manager.broadcast_to_space_staff(
        str(org.id), "customer_message", {
            "session_id": session_id,
            "message":    message,
            "role":       "user",
            "timestamp":  datetime.utcnow().isoformat(),
        }
    )

    return CustomerChatResponse(
        reply="", agent="human", intent="human_handoff",
        session_id=session_id, rag_hit=False, response_ms=0, citations=[],
    )


async def _maybe_escalate(
    db: AsyncSession,
    chatbot: Chatbot,
    org: Space,
    result: dict,
    session_id: str,
    message: str,
) -> None:
    """
    Trigger human escalation if the agent requested it or heuristics fire.
    Mutates result in-place: sets reply to the transfer message and agent to "human".
    No-op if human_transfer_enabled is False or session_id is absent.
    """
    if not chatbot.human_transfer_enabled or not session_id:
        return

    from app.orchestra.ai.workflows.escalation import should_escalate
    from app.services.inbox.transfer_service import transfer_to_staff

    turn = 0
    try:
        from app.models.chat import ChatSession as _CS
        row = (await db.execute(
            select(_CS).where(_CS.id == uuid.UUID(session_id))
        )).scalar_one_or_none()
        # Guard against row being None — without this, AttributeError is
        # swallowed and (worse) a genuine DB error leaves the transaction
        # aborted without a rollback, poisoning every later query on this
        # session (InFailedSQLTransactionError).
        if row:
            turn = (row.message_count or 0) + 1
    except Exception:
        logger.warning(
            "customer_chat.escalation_turn_count_failed",
            session_id=session_id,
            space_id=str(org.id),
        )
        # Critical: rollback the aborted transaction so downstream DB
        # operations (_persist_turn, _persist_thoughts) can still succeed.
        await db.rollback()

    explicit = result.get("reply", "").strip() == "__ESCALATE__" or result.get("escalate")
    auto     = should_escalate(result, turn_count=turn)

    if not (explicit or auto):
        return

    try:
        await transfer_to_staff(
            db=db,
            session_id=uuid.UUID(session_id),
            source="ai_escalation",
            escalation_reason="agent_requested" if explicit else "auto_heuristic",
            last_customer_message=message,
        )
        import asyncio
        from app.orchestra.ai.workflows.escalation import run_escalation_workflow
        asyncio.create_task(run_escalation_workflow(
            session_id=session_id,
            space_id=str(org.id),
            org_name=org.display_name,
            history=[{"role": "user", "content": message}],
        ))
        result["reply"] = chatbot.human_transfer_message or "Connecting you with a human agent."
        result["agent"] = "human"
        event_context = ConversationExecutionContext(
            space_id=org.id,
            chatbot_id=chatbot.id,
            session_id=session_id,
            conversation_id=session_id,
        )
        await record_conversation_event(
            context=event_context,
            event_type=ConversationEventType.ESCALATION_STARTED,
            data=ConversationEventData(
                agent="human",
                metadata={"reason": "agent_requested" if explicit else "auto_heuristic"},
            ),
        )
    except Exception:
        # Escalation is a safety fallback, but an inbox outage must not make the
        # customer-facing chat endpoint fail with an unrelated server error.
        logger.exception(
            "customer_chat.escalation_failed",
            space_id=str(org.id),
            chatbot_id=str(chatbot.id),
            session_id=session_id,
        )
        # Critical: rollback the poisoned transaction so _persist_turn can
        # still commit the customer's message and the AI reply.  Without this,
        # every subsequent db.execute() fails with InFailedSQLTransactionError.
        await db.rollback()


async def _persist_turn(
    db: AsyncSession,
    org: Space,
    chatbot: Chatbot,
    incoming_session_id: Optional[str],
    result: dict,
    elapsed_ms: int,
    message: str,
    customer=None,
) -> tuple[str, str]:
    """
    Upsert ChatSession, write both ConversationLog rows, commit, refresh Redis TTL.
    Returns (canonical session_id, assistant ConversationLog id) — the latter lets
    the frontend attach thumbs up/down feedback to this specific reply.

    customer: the signed-in ChatbotUser, when there is one. New sessions are
    stamped with them, and an existing anonymous session is claimed — so signing
    in mid-conversation keeps the thread instead of stranding it.
    """
    from app.models.chat import ChatSession
    from app.core.redis import redis_client
    from app.api.v1.chat_sessions import _history_key, HISTORY_TTL

    agent_slug = result.get("agent", "unknown")

    chat_session = None
    if incoming_session_id:
        try:
            res = await db.execute(
                select(ChatSession).where(
                    ChatSession.id == uuid.UUID(incoming_session_id),
                    ChatSession.space_id == org.id,
                )
            )
            chat_session = res.scalar_one_or_none()
        except ValueError:
            pass

    if not chat_session:
        # Create with the canonical id the orchestrator already ran under, so the
        # persisted ChatSession, the Agno session store, and citations all share
        # one id. Fall back to a fresh uuid only if the incoming id is unusable.
        try:
            new_id = uuid.UUID(incoming_session_id) if incoming_session_id else uuid.uuid4()
        except (ValueError, TypeError):
            new_id = uuid.uuid4()
        chat_session = ChatSession(
            id=new_id,
            space_id=org.id,
            chatbot_id=chatbot.id,
            chatbot_user_id=customer.id if customer else None,
            title=message[:100].strip(),
            agent_slug=agent_slug,
            status="open",
            message_count=1,
        )
        db.add(chat_session)
        await db.flush()
    else:
        chat_session.agent_slug      = agent_slug
        chat_session.message_count   = (chat_session.message_count or 0) + 1
        chat_session.last_message_at = datetime.utcnow()
        # Claim an anonymous session for the customer who just signed in. Never
        # reassigns a session that already belongs to someone else.
        if customer is not None and chat_session.chatbot_user_id is None:
            chat_session.chatbot_user_id = customer.id

    session_id = str(chat_session.id)

    db.add(ConversationLog(
        space_id=org.id, chatbot_id=chatbot.id, session_id=session_id,
        role="user", message=message,
        intent=result.get("intent"), agent_slug=agent_slug,
        rag_hit=result.get("rag_hit", False), response_ms=elapsed_ms,
    ))
    assistant_log = ConversationLog(
        space_id=org.id, chatbot_id=chatbot.id, session_id=session_id,
        role="assistant", message=result.get("reply", ""),
        intent=result.get("intent"), agent_slug=agent_slug,
        rag_hit=result.get("rag_hit", False),
        citations=result.get("citations") or None,
        blocks=result.get("blocks") or None,
    )
    db.add(assistant_log)
    await db.commit()

    from app.api.v1.chat_sessions import _invalidate_history_cache
    await _invalidate_history_cache(session_id, redis_client)
    return session_id, str(assistant_log.id)




async def _persist_thoughts(
    db: AsyncSession,
    org: Space,
    chatbot: Chatbot,
    session_id: str,
    message_id: str,
    result: dict,
    segments: Optional[list] = None,
) -> None:
    """
    Persist this turn's chain-of-thought to message_thoughts, if any.

    `message_id` is the assistant ConversationLog.id returned by
    _persist_turn — the FK that anchors each thought row to exactly one
    customer-facing message. Reasoning text lives here, never in
    conversation_logs.message, so the transcript stays clean while the
    thinking is retained for admin review and analytics.

    `segments` is the ordered per-delta list ({seq, content}) from a streamed
    run; the non-streaming path persists just the merged text.
    """
    reasoning = result.get("reasoning")
    if not reasoning or not message_id:
        return
    db.add(MessageThought(
        message_id=uuid.UUID(message_id),
        space_id=org.id,
        session_id=session_id,
        chatbot_id=chatbot.id,
        agent_slug=result.get("agent"),
        role="reasoning",
        content=reasoning,
        segments=segments or None,
        model=result.get("model"),
        reasoning_effort=result.get("reasoning_effort"),
    ))
    await db.commit()


# ── HITL pause/resume (ask_user) ────────────────────────────────────────────

# How long a paused run waits for the customer to answer before the next
# message is treated as a fresh turn instead of a resume attempt. Deliberately
# generous — abandoning early means the resume silently fails and the customer
# has to ask again from scratch.
_PENDING_CLARIFY_TTL = timedelta(minutes=30)


async def _get_pending_clarify(db: AsyncSession, session_id: Optional[str], space_id) -> Optional[dict]:
    """
    Look up an unresolved ask_user pause for this session. Returns
    {run_id, requirements} for resume(), or None if there is nothing pending or
    it expired — an expired one is cleared here so it doesn't linger.
    """
    from app.models.chat import ChatSession

    if not session_id:
        return None
    try:
        sess_uuid = uuid.UUID(session_id)
    except ValueError:
        return None

    session = (await db.execute(
        select(ChatSession).where(ChatSession.id == sess_uuid, ChatSession.space_id == space_id)
    )).scalar_one_or_none()
    if not session or not session.pending_run_id:
        return None

    if session.pending_since and datetime.utcnow() - session.pending_since > _PENDING_CLARIFY_TTL:
        session.pending_run_id = None
        session.pending_requirement = None
        session.pending_since = None
        await db.commit()
        return None

    return {"run_id": session.pending_run_id, "requirements": session.pending_requirement.get("requirements", [])}


async def _set_pending_clarify(db: AsyncSession, session_id: str, pending: dict) -> None:
    """Persist the paused run so the next message can resume() it."""
    from app.models.chat import ChatSession

    session = (await db.execute(
        select(ChatSession).where(ChatSession.id == uuid.UUID(session_id))
    )).scalar_one_or_none()
    if not session:
        return
    session.pending_run_id = pending["run_id"]
    session.pending_requirement = pending
    session.pending_since = datetime.utcnow()
    await db.commit()


async def _clear_pending_clarify(db: AsyncSession, session_id: str) -> None:
    from app.models.chat import ChatSession

    session = (await db.execute(
        select(ChatSession).where(ChatSession.id == uuid.UUID(session_id))
    )).scalar_one_or_none()
    if not session or not session.pending_run_id:
        return
    session.pending_run_id = None
    session.pending_requirement = None
    session.pending_since = None
    await db.commit()


# ── OPTIONS preflights (widget embeds / cross-origin callers) ─────────────────

@router.options("/api/chat/{slug}")
async def preflight_chat(slug: str):
    return JSONResponse({}, headers=_CORS)

@router.options("/api/chat/{slug}/suggestions")
async def preflight_suggestions(slug: str):
    return JSONResponse({}, headers=_CORS)

@router.options("/api/chat/{slug}/stream")
async def preflight_chat_stream(slug: str):
    return JSONResponse({}, headers=_CORS)

@router.options("/api/chat/{slug}/feedback")
async def preflight_feedback(slug: str):
    return JSONResponse({}, headers=_CORS)

@router.options("/api/chat/{slug}/session/init")
async def preflight_session_init(slug: str):
    return JSONResponse({}, headers=_CORS)

@router.options("/api/chat/{slug}/session/{session_id}")
async def preflight_session(slug: str, session_id: str):
    return JSONResponse({}, headers=_CORS)

@router.options("/api/chat/{slug}/session/{session_id}/close")
async def preflight_session_close(slug: str, session_id: str):
    return JSONResponse({}, headers=_CORS)


def _canonical_session_id(incoming: Optional[str]) -> str:
    """
    Resolve the session id to use for THIS request, BEFORE the AI runs.

    Returning user → reuse their id. First turn (missing / "new" / invalid) →
    mint a fresh UUID. This only generates the *identifier*; the ChatSession DB
    row is still created lazily in _persist_turn on the first real message, so
    opening the widget without sending anything persists nothing. The same id is
    passed to the orchestrator (session_id + user_id) and to _persist_turn, so
    history/memory thread from turn 1.
    """
    if incoming:
        try:
            return str(uuid.UUID(incoming))   # valid existing id → keep it
        except (ValueError, TypeError):
            pass
    return str(uuid.uuid4())


def _answer_event_data(result: dict, elapsed_ms: int, *, transport: str) -> ConversationEventData:
    """Map an executor result to redacted analytics fields.

    Reply text, reasoning, citations, and structured blocks are deliberately
    excluded. Their detailed records already live in tenant-scoped message and
    thought tables; duplicating them into analytics would increase PII exposure.
    """

    return ConversationEventData(
        agent=result.get("agent"),
        intent=result.get("intent"),
        rag_hit=result.get("rag_hit", False),
        response_ms=elapsed_ms,
        model=result.get("model"),
        reasoning_effort=result.get("reasoning_effort"),
        source_count=len(result.get("citations") or []),
        metadata={"transport": transport},
    )


# ── Customer chat API ─────────────────────────────────────────────────────────

@router.post("/api/chat/{slug}", response_model=CustomerChatResponse)
async def customer_chat(slug: str, req: CustomerChatRequest,
                        chatbot_slug: Optional[str] = Query(None, alias="chatbot"),
                        authorization: Optional[str] = Header(None)):
    from app.core.chatbot_auth import resolve_customer, login_gate_blocks

    try:
        org, chatbot, db = await _get_brand(slug, chatbot_slug)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code, headers=_CORS)

    t0 = time.time()
    try:
        # 0. Customer login gate. The signed-in customer (if any) also owns the
        # session below. `code` lets the widget show the Google button rather
        # than a generic error.
        customer = await resolve_customer(authorization, db)
        if await login_gate_blocks(db, chatbot, req.session_id, customer):
            return JSONResponse(
                {"detail": "Please sign in to continue this conversation.",
                 "code": "login_required"},
                status_code=401, headers=_CORS,
            )

        # 1. Human handoff — return early if session is owned by staff
        if req.session_id:
            handoff = await _handle_human_session(db, org, chatbot, req.session_id, req.message)
            if handoff:
                return JSONResponse(handoff.model_dump(), headers=_CORS)

        # 2. Run AI
        active_agents = await _get_active_agents_cached(db, chatbot.id, str(org.id))
        if not active_agents:
            return JSONResponse(
                {"detail": "No active agents configured for this bot."},
                status_code=503,
                headers=_CORS,
            )

        # Resolve the canonical session id BEFORE the run so session_id + user_id
        # thread into the orchestrator's memory from the very first turn.
        session_id = _canonical_session_id(req.session_id)
        execution_context = ConversationExecutionContext(
            space_id=org.id,
            chatbot_id=chatbot.id,
            session_id=session_id,
            conversation_id=req.conversation_id or session_id,
            customer_id=customer.id if customer else None,
        )
        # AI usage attribution — task-scoped ContextVar; every provider call in
        # this request records space/chatbot/session without touching call sites.
        from app.services.ai_usage_context import AiUsageContext, set_ai_usage_context
        set_ai_usage_context(AiUsageContext(
            space_id=org.id, chatbot_id=chatbot.id,
            session_id=uuid.UUID(session_id) if session_id else None,
        ))
        await record_conversation_event(
            context=execution_context,
            event_type=ConversationEventType.MESSAGE_RECEIVED,
            data=ConversationEventData(metadata={"transport": "json"}),
        )
        # If the agent paused on ask_user last turn, this message is the
        # customer's answer, not a new question — resume that run instead of
        # starting a fresh one. See docs/structured-response-rendering-plan.md.
        pending = await _get_pending_clarify(db, session_id, org.id)
        executor = build_customer_executor(
            context=execution_context,
            space=org,
            active_agents=active_agents,
            leader=await _get_triage_agent_cached(db, chatbot.id, str(org.id)),
            clarify_enabled=chatbot.clarify_enabled,
            llm_model=chatbot.llm_model,
            reasoning_effort=chatbot.reasoning_effort,
        )
        if pending:
            result = await executor.resume(
                run_id=pending["run_id"], requirements=pending["requirements"], answer=req.message,
            )
        else:
            result = await executor.run(message=req.message)

        # 3. Auto-escalation
        await _maybe_escalate(db, chatbot, org, result, req.session_id, req.message)

        # 4. Persist both turns and return
        elapsed_ms = int((time.time() - t0) * 1000)
        try:
            session_id, message_id = await _persist_turn(db, org, chatbot, session_id, result, elapsed_ms, req.message, customer)
        except Exception:
            # Safety net: if the session is still in a failed transaction
            # state (e.g. from an unhandled _maybe_escalate DB error),
            # rollback and retry the persist once before giving up.
            logger.warning("customer_chat.persist_retry", session_id=session_id, slug=slug)
            await db.rollback()
            session_id, message_id = await _persist_turn(db, org, chatbot, session_id, result, elapsed_ms, req.message, customer)
        await _persist_thoughts(db, org, chatbot, session_id, message_id, result)
        try:
            assistant_message_id = uuid.UUID(message_id)
        except (ValueError, TypeError):
            assistant_message_id = None
        await record_conversation_event(
            context=execution_context,
            event_type=ConversationEventType.ANSWER_COMPLETED,
            data=_answer_event_data(result, elapsed_ms, transport="json"),
            message_id=assistant_message_id,
        )

        # Carry the pause forward (or clear it) now that the session row is
        # guaranteed to exist — _persist_turn creates it lazily on turn 1.
        if executor.pending:
            await _set_pending_clarify(db, session_id, executor.pending)
        elif pending:
            await _clear_pending_clarify(db, session_id)

        return JSONResponse(
            CustomerChatResponse(
                reply=result.get("reply", ""),
                agent=result.get("agent", "unknown"),
                intent=result.get("intent", "unknown"),
                session_id=session_id,
                rag_hit=result.get("rag_hit", False),
                response_ms=elapsed_ms,
                citations=result.get("citations", []),
                message_id=message_id,
                clarify=result.get("clarify"),
                blocks=result.get("blocks") or [],
                reasoning=result.get("reasoning"),
            ).model_dump(),
            headers=_CORS,
        )

    except Exception as e:
        logger.error("customer_chat.failed", slug=slug, error=str(e))
        return JSONResponse(
            {"detail": "Chat processing failed. Please try again."},
            status_code=500,
            headers=_CORS,
        )
    finally:
        await db.close()


# ── Streaming chat ───────────────────────────────────────────────────────────

@router.post("/api/chat/{slug}/stream")
async def customer_chat_stream(slug: str, req: CustomerChatRequest,
                               chatbot_slug: Optional[str] = Query(None, alias="chatbot")):
    """
    Stream reply chunks as SSE.

    Flow:
      1. Frontend calls POST /session/init → Team is pre-warmed
      2. Frontend calls POST /stream with the same session_id
      3. Cached Team runs arun(stream=True) → chunks arrive immediately
      4. After last chunk: persist turn + escalation check → send 'done' event

    Events:
      event: reasoning  data: <text>     — one per chain-of-thought delta (before the reply)
      data: <text chunk>                 — one per streamed token/sentence
      event: done  data: <JSON>   — {session_id, agent, rag_hit, message_id, reasoning} — stream complete
      event: error data: <msg>    — on failure
    """
    try:
        org, chatbot, db = await _get_brand(slug, chatbot_slug)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code, headers=_CORS)

    # Human handoff must be resolved before we open the stream
    if req.session_id:
        handoff = await _handle_human_session(db, org, chatbot, req.session_id, req.message)
        if handoff:
            await db.close()
            return JSONResponse(handoff.model_dump(), headers=_CORS)

    active_agents = await _get_active_agents_cached(db, chatbot.id, str(org.id))
    if not active_agents:
        await db.close()
        return JSONResponse(
            {"detail": "No active agents configured for this bot."},
            status_code=503, headers=_CORS,
        )

    # Canonical session id before the stream opens → history threads from turn 1.
    session_id = _canonical_session_id(req.session_id)
    execution_context = ConversationExecutionContext(
        space_id=org.id,
        chatbot_id=chatbot.id,
        session_id=session_id,
        conversation_id=req.conversation_id or session_id,
    )
    # AI usage attribution — task-scoped ContextVar (visible inside the stream
    # generator too); see the non-streaming path for the same pattern.
    from app.services.ai_usage_context import AiUsageContext, set_ai_usage_context
    set_ai_usage_context(AiUsageContext(
        space_id=org.id, chatbot_id=chatbot.id,
        session_id=uuid.UUID(session_id) if session_id else None,
    ))
    await record_conversation_event(
        context=execution_context,
        event_type=ConversationEventType.MESSAGE_RECEIVED,
        data=ConversationEventData(metadata={"transport": "sse"}),
    )
    executor = build_customer_executor(
        context=execution_context,
        space=org,
        active_agents=active_agents,
        leader=await _get_triage_agent_cached(db, chatbot.id, str(org.id)),
        clarify_enabled=chatbot.clarify_enabled,
        llm_model=chatbot.llm_model,
        reasoning_effort=chatbot.reasoning_effort,
    )
    t0 = time.time()
    # If the agent paused on ask_user last turn, this message is the customer's
    # answer, not a new question — resume that run (same contract as the
    # non-streaming customer_chat). A resumed run is not streamed: it returns
    # its full reply, which we emit as a single chunk + the done event.
    pending = await _get_pending_clarify(db, session_id, org.id)

    async def generate():
        chunks: List[str] = []
        reasoning_chunks: List[str] = []
        try:
            if pending:
                result = await executor.resume(
                    run_id=pending["run_id"], requirements=pending["requirements"], answer=req.message,
                )
                reply_text = result.get("reply", "")
                chunks = [reply_text]
                if reply_text:
                    yield {"data": reply_text}
                if executor.pending:
                    await _set_pending_clarify(db, session_id, executor.pending)
                else:
                    await _clear_pending_clarify(db, session_id)
            else:
                # agno yields tagged ("reasoning"|"content", text) tuples; the
                # dynamic adapter still yields plain strings (content).
                async for chunk in executor.stream(req.message):
                    if isinstance(chunk, tuple) and len(chunk) == 2 and chunk[0] != "content":
                        reasoning_chunks.append(chunk[1])
                        yield {"event": "reasoning", "data": chunk[1]}
                    else:
                        text = chunk[1] if isinstance(chunk, tuple) and len(chunk) == 2 else chunk
                        chunks.append(text)
                        yield {"data": text}

                # Stream complete — pull structured metadata the SSE text stream
                # couldn't carry inline (agent/rag_hit/citations from the final run).
                reply_text = "".join(chunks)
                meta = getattr(executor, "last_result", None) or {}
                result = {
                    "reply":     reply_text,
                    "agent":     meta.get("agent", "team"),
                    "intent":    meta.get("intent", meta.get("agent", "team")),
                    "rag_hit":   meta.get("rag_hit", False),
                    "citations": meta.get("citations", []),
                    "blocks":    meta.get("blocks", []),
                    "clarify":   meta.get("clarify"),
                    "reasoning": meta.get("reasoning"),
                    "model":     meta.get("model"),
                    "reasoning_effort": meta.get("reasoning_effort"),
                }
            elapsed_ms = int((time.time() - t0) * 1000)
            await _maybe_escalate(db, chatbot, org, result, session_id, req.message)
            try:
                _, message_id = await _persist_turn(
                    db, org, chatbot, session_id, result, elapsed_ms, req.message
                )
            except Exception:
                # Safety net: if the session is still in a failed transaction
                # state (e.g. from an unhandled _maybe_escalate DB error),
                # rollback and retry the persist once before giving up.
                logger.warning("customer_chat_stream.persist_retry",
                               session_id=session_id, slug=slug)
                await db.rollback()
                _, message_id = await _persist_turn(
                    db, org, chatbot, session_id, result, elapsed_ms, req.message
                )
            # Per-delta segments for faithful replay — only when reasoning
            # actually streamed live (reasoning_chunks non-empty).
            segments = [{"seq": i, "content": c} for i, c in enumerate(reasoning_chunks)] or None
            await _persist_thoughts(db, org, chatbot, session_id, message_id, result, segments)
            try:
                assistant_message_id = uuid.UUID(message_id)
            except (ValueError, TypeError):
                assistant_message_id = None
            await record_conversation_event(
                context=execution_context,
                event_type=ConversationEventType.ANSWER_COMPLETED,
                data=_answer_event_data(result, elapsed_ms, transport="sse"),
                message_id=assistant_message_id,
            )
            yield {
                "event": "done",
                "data":  json.dumps({
                    "session_id": session_id,
                    "reply":      reply_text,
                    "agent":      result.get("agent", "team"),
                    "rag_hit":    result.get("rag_hit", False),
                    "citations":  result.get("citations", []),
                    "blocks":     result.get("blocks", []),
                    "message_id": message_id,
                    "reasoning":  result.get("reasoning"),
                    "clarify":    result.get("clarify"),
                }),
            }

        except Exception:
            logger.exception("customer_chat_stream.failed", slug=slug)
            yield {"event": "error", "data": "Stream failed. Please try again."}
        finally:
            await db.close()

    return EventSourceResponse(generate(), headers=_CORS)


# ── Chat suggestions ──────────────────────────────────────────────────────────

@router.get("/api/chat/{slug}/suggestions")
async def get_chat_suggestions(slug: str,
                               chatbot_slug: Optional[str] = Query(None, alias="chatbot")):
    """Return 4 AI-generated suggestion chips for the customer chat page."""
    from app.utils.ai.chat_suggestions import get_suggestions
    from app.rag.vector_store import get_vector_store

    # chatbot_slug MUST be forwarded: without it _get_brand falls back to the
    # space's default chatbot, and every sibling chatbot in the space was served
    # the default one's chips (its frozen snapshot, then its cache entry).
    org, chatbot, db = await _get_brand(slug, chatbot_slug)
    try:
        from app.models.chatbot import ChatbotHomepageSnapshot
        snap = None
        try:
            snap = await db.get(ChatbotHomepageSnapshot, chatbot.id)
            # Frozen chips from a published homepage snapshot -- serve them and
            # skip the LLM, matching the frozen welcome sections (see space.py
            # serving).
            if snap and isinstance(snap.published_payload, dict):
                frozen = snap.published_payload.get("suggestions")
                if isinstance(frozen, list) and frozen:
                    return {"suggestions": [s for s in frozen if isinstance(s, str)][:4]}
            # Not published, but a draft may already carry suggestions from a
            # previous admin "Generate" -- durable (Postgres row, no expiry).
            # Serving it here means suggestions only ever change when the owner
            # explicitly regenerates or publishes the homepage, never on their
            # own from a cache lapsing.
            if snap and isinstance(snap.draft_payload, dict):
                draft = snap.draft_payload.get("suggestions")
                if isinstance(draft, list) and draft:
                    return {"suggestions": [s for s in draft if isinstance(s, str)][:4]}
        except Exception:
            logger.warning("get_chat_suggestions.snapshot_read_failed", slug=slug)

        try:
            active_agents = await _get_active_agents_cached(db, chatbot.id, str(org.id))
            store = get_vector_store()
            doc_types = store.get_org_doc_types(str(org.id))
        except Exception:
            logger.exception("get_chat_suggestions.setup_failed", slug=slug)
            active_agents, doc_types = [], []
        suggestions = await get_suggestions(
            space_id=org.id,
            chatbot_id=chatbot.id,
            org_name=org.display_name,
            active_agents=active_agents,
            doc_types=doc_types,
        )
        return {"suggestions": suggestions}
    except Exception:
        logger.exception("get_chat_suggestions.failed", slug=slug)
        from app.utils.ai.chat_suggestions import _FALLBACKS
        return {"suggestions": _FALLBACKS}
    finally:
        await db.close()


# ── Message feedback (thumbs up/down on an AI reply) ─────────────────────────

@router.post("/api/chat/{slug}/feedback", status_code=204)
async def submit_feedback(slug: str, req: FeedbackRequest,
                          chatbot_slug: Optional[str] = Query(None, alias="chatbot")):
    """Record a customer's thumbs up/down on a specific AI reply."""
    rating = req.rating.strip().lower()
    if rating not in ("up", "down"):
        return JSONResponse({"detail": "rating must be 'up' or 'down'."},
                            status_code=400, headers=_CORS)

    org, chatbot, db = await _get_brand(slug, chatbot_slug)
    try:
        try:
            log_uuid = uuid.UUID(req.message_id)
        except (ValueError, TypeError):
            return JSONResponse({"detail": "Invalid message_id."}, status_code=400, headers=_CORS)

        # Scope the update to this org so one brand can't rate another's messages.
        row = (await db.execute(
            select(ConversationLog).where(
                ConversationLog.id == log_uuid,
                ConversationLog.space_id == org.id,
                ConversationLog.role == "assistant",
            )
        )).scalar_one_or_none()
        if not row:
            return JSONResponse({"detail": "Message not found."}, status_code=404, headers=_CORS)

        row.feedback = rating
        await db.commit()
        try:
            event_context = ConversationExecutionContext(
                space_id=org.id,
                chatbot_id=chatbot.id,
                session_id=row.session_id,
                conversation_id=row.session_id,
            )
            await record_conversation_event(
                context=event_context,
                event_type=ConversationEventType.FEEDBACK_RECEIVED,
                data=ConversationEventData(metadata={"rating": rating}),
                message_id=row.id,
            )
        except (ValueError, TypeError):
            # Historical rows may contain a non-UUID session id. Feedback is
            # already saved, so skip optional analytics rather than reject it.
            logger.warning(
                "customer_feedback.event_skipped",
                space_id=str(org.id),
                chatbot_id=str(chatbot.id),
                message_id=str(row.id),
                reason="invalid_session_id",
            )
        return JSONResponse({}, status_code=204, headers=_CORS)
    finally:
        await db.close()


# ── Session init (chat widget open) ──────────────────────────────────────────

@router.post("/api/chat/{slug}/session/init", response_model=SessionInitResponse)
async def init_chat_session(slug: str,
                            chatbot_slug: Optional[str] = Query(None, alias="chatbot")):
    """
    Called by the frontend when the chat widget opens.

    Populates the agent cache and pre-builds the executor (Team for Agno,
    no-op for Dynamic) so the first message has no cold-start delay.
    Returns a session_id the frontend uses for the entire chat session.
    """
    try:
        org, chatbot, db = await _get_brand(slug, chatbot_slug)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code, headers=_CORS)

    try:
        active_agents = await _get_active_agents_cached(db, chatbot.id, str(org.id))
        if not active_agents:
            return JSONResponse(
                {"detail": "No active agents configured for this bot."},
                status_code=503,
                headers=_CORS,
            )

        session_id = str(uuid.uuid4())
        execution_context = ConversationExecutionContext(
            space_id=org.id,
            chatbot_id=chatbot.id,
            session_id=session_id,
            conversation_id=session_id,
        )
        executor = build_customer_executor(
            context=execution_context,
            space=org,
            active_agents=active_agents,
            leader=await _get_triage_agent_cached(db, chatbot.id, str(org.id)),
            clarify_enabled=chatbot.clarify_enabled,
            llm_model=chatbot.llm_model,
            reasoning_effort=chatbot.reasoning_effort,
        )
        await executor.warmup()

        return JSONResponse(SessionInitResponse(session_id=session_id).model_dump(), headers=_CORS)
    except Exception as e:
        logger.error("init_chat_session.failed", slug=slug, error=str(e))
        return JSONResponse({"detail": "Session init failed."}, status_code=500, headers=_CORS)
    finally:
        await db.close()


# ── Session close (chatbox unmount) ──────────────────────────────────────────

@router.post("/api/chat/{slug}/session/{session_id}/close", status_code=204)
async def close_session(slug: str, session_id: str):
    """
    Called by the frontend when the chatbox closes.
    Agent runners are cached at the bot level and outlive individual sessions —
    eviction is handled by the TTL sweeper or explicit config-change invalidation.
    """


# ── Public session restore ────────────────────────────────────────────────────

@router.get("/api/chat/{slug}/session/{session_id}")
async def get_session_history(slug: str, session_id: str,
                              chatbot_slug: Optional[str] = Query(None, alias="chatbot"),
                              authorization: Optional[str] = Header(None)):
    """Restore a chat session. Returns message history for frontend rendering."""
    from app.core.chatbot_auth import resolve_customer

    # The session is found by space + session id, so the resolved chatbot is not
    # used below — but every endpoint in this file forwards chatbot_slug, and one
    # that quietly resolves the default chatbot is a trap for the next change.
    org, chatbot, db = await _get_brand(slug, chatbot_slug)
    try:
        from app.models.chat import ChatSession
        try:
            sess_uuid = uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(400, "Invalid session id.")

        sess_result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == sess_uuid,
                ChatSession.space_id == org.id,
            )
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            raise HTTPException(404, "Session not found.")

        # A session owned by a signed-in customer is private to them. Anonymous
        # sessions stay reachable by their (unguessable) id, so existing ?chat=
        # links keep working.
        if session.chatbot_user_id is not None:
            customer = await resolve_customer(authorization, db)
            if customer is None or customer.id != session.chatbot_user_id:
                raise HTTPException(403, "This conversation belongs to another account.")

        session_meta = {"ai_disabled": session.ai_disabled, "status": session.status}

        from app.core.redis import redis_client
        from app.api.v1.chat_sessions import _history_key, _set_history_cache
        cached = await redis_client.get(_history_key(session_id))
        if cached is not None:
            return {"session_id": session_id, "history": cached, **session_meta}

        logs_result = await db.execute(
            select(ConversationLog)
            .where(ConversationLog.session_id == session_id)
            .order_by(ConversationLog.timestamp)
        )
        logs = logs_result.scalars().all()

        # Reasoning/thoughts keyed by assistant message id (message_thoughts
        # PK is conversation_logs.id). Attach to the matching log entries so a
        # restored widget can re-render the "Thinking…" block.
        thoughts_by_msg = {}
        if logs:
            t_result = await db.execute(
                select(MessageThought).where(MessageThought.session_id == session_id)
            )
            for t in t_result.scalars().all():
                thoughts_by_msg[str(t.message_id)] = t.content

        history = [
            {
                "id":         str(log.id),
                "role":       log.role,
                "message":    log.message,
                "agent_slug": log.agent_slug,
                "citations":  log.citations or [],
                "blocks":     log.blocks or [],
                "reasoning":  thoughts_by_msg.get(str(log.id)),
                "timestamp":  log.timestamp.isoformat() if log.timestamp else None,
                "created_at": log.timestamp.isoformat() if log.timestamp else None,
            }
            for log in logs
        ]

        await _set_history_cache(session_id, history, redis_client)
        return {"session_id": session_id, "history": history, **session_meta}
    finally:
        await db.close()

"""
Public customer-facing endpoints.

POST /api/chat/{slug}                         — chat against a brand's active agents
GET  /api/chat/{slug}/suggestions             — suggestion chips
GET  /api/chat/{slug}/session/{id}            — restore session history
POST /api/chat/{slug}/session/{session_id}/close — chatbox unmount signal
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import List, Optional

import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.space import (
    Space, ConversationLog,
    BuiltinAgentCatalog, SpaceBuiltinAgentConfig, CustomAgent, ChatbotCustomAgent,
)
from app.models.chatbot import Chatbot

logger = structlog.get_logger()
router = APIRouter(tags=["Customer"])

# CORS headers applied to every /api/chat/ response so cross-origin widget
# embeds and external sites can reach these public endpoints.
_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


# ── Request / Response ────────────────────────────────────────────────────────

class CustomerChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None


class CustomerChatResponse(BaseModel):
    reply: str
    agent: str
    intent: str
    session_id: str
    rag_hit: bool
    response_ms: int
    citations: List[dict] = []


class SessionInitResponse(BaseModel):
    session_id: str


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_brand(slug: str):
    """Return (Space, Chatbot, db) for slug. Raises 404/503 if missing."""
    from app.core.database import AsyncSessionLocal
    db = AsyncSessionLocal()
    result = await db.execute(
        select(Space).where(Space.slug == slug, Space.active == True)
    )
    org = result.scalar_one_or_none()
    if not org:
        await db.close()
        raise HTTPException(404, f"Brand '{slug}' not found.")

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

    First call per space: hits the DB (2 queries) and caches the result.
    Subsequent calls within the TTL: returns from cache — no DB queries.
    Cache is busted automatically when agent config changes via
    pool.invalidate_bot_agents(space_id).
    """
    from app.orchestra.ai.session.pool import pool as _pool
    cached = _pool.get_agents(space_id)
    if cached is not None:
        return cached
    agents = await _get_active_agents(db, chatbot_id)
    if agents:
        _pool.set_agents(space_id, agents)
    return agents


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
            BuiltinAgentCatalog.agent_type != "triage",
        )
    )
    builtin_agents = [ResolvedAgent.from_builtin(cfg) for cfg in builtin_res.scalars().all()]

    custom_res = await db.execute(
        select(CustomAgent)
        .options(selectinload(CustomAgent.knowledge_bases))
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
        turn = (row.message_count or 0) + 1
    except Exception:
        pass

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
    except Exception:
        pass  # never break the chat for a failed escalation


async def _persist_turn(
    db: AsyncSession,
    org: Space,
    chatbot: Chatbot,
    incoming_session_id: Optional[str],
    result: dict,
    elapsed_ms: int,
    message: str,
) -> str:
    """
    Upsert ChatSession, write both ConversationLog rows, commit, refresh Redis TTL.
    Returns the canonical session_id string.
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
        chat_session = ChatSession(
            space_id=org.id,
            chatbot_id=chatbot.id,
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

    session_id = str(chat_session.id)

    db.add(ConversationLog(
        space_id=org.id, chatbot_id=chatbot.id, session_id=session_id,
        role="user", message=message,
        intent=result.get("intent"), agent_slug=agent_slug,
        rag_hit=result.get("rag_hit", False), response_ms=elapsed_ms,
    ))
    db.add(ConversationLog(
        space_id=org.id, chatbot_id=chatbot.id, session_id=session_id,
        role="assistant", message=result.get("reply", ""),
        intent=result.get("intent"), agent_slug=agent_slug,
    ))
    await db.commit()

    await redis_client.expire(_history_key(session_id), HISTORY_TTL)
    return session_id


# ── OPTIONS preflights (widget embeds / cross-origin callers) ─────────────────

@router.options("/api/chat/{slug}")
async def preflight_chat(slug: str):
    return JSONResponse({}, headers=_CORS)

@router.options("/api/chat/{slug}/suggestions")
async def preflight_suggestions(slug: str):
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


# ── Customer chat API ─────────────────────────────────────────────────────────

@router.post("/api/chat/{slug}", response_model=CustomerChatResponse)
async def customer_chat(slug: str, req: CustomerChatRequest):
    from app.orchestra.ai.core.factory import build_executor

    try:
        org, chatbot, db = await _get_brand(slug)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code, headers=_CORS)

    t0 = time.time()
    try:
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

        executor = build_executor(
            org=org,
            active_agents=active_agents,
            session_id=req.session_id or "new",
            conversation_id=req.conversation_id or req.session_id or "new",
        )
        result = await executor.run(message=req.message)

        # 3. Auto-escalation
        await _maybe_escalate(db, chatbot, org, result, req.session_id, req.message)

        # 4. Persist both turns and return
        elapsed_ms = int((time.time() - t0) * 1000)
        session_id = await _persist_turn(db, org, chatbot, req.session_id, result, elapsed_ms, req.message)

        return JSONResponse(
            CustomerChatResponse(
                reply=result.get("reply", ""),
                agent=result.get("agent", "unknown"),
                intent=result.get("intent", "unknown"),
                session_id=session_id,
                rag_hit=result.get("rag_hit", False),
                response_ms=elapsed_ms,
                citations=result.get("citations", []),
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


# ── Chat suggestions ──────────────────────────────────────────────────────────

@router.get("/api/chat/{slug}/suggestions")
async def get_chat_suggestions(slug: str):
    """Return 4 AI-generated suggestion chips for the customer chat page."""
    from app.utils.ai.chat_suggestions import get_suggestions
    from app.rag.vector_store import get_vector_store

    org, chatbot, db = await _get_brand(slug)
    try:
        try:
            active_agents = await _get_active_agents_cached(db, chatbot.id, str(org.id))
            store = get_vector_store()
            doc_types = store.get_org_doc_types(str(org.id))
        except Exception:
            logger.exception("get_chat_suggestions.setup_failed", slug=slug)
            active_agents, doc_types = [], []
        suggestions = await get_suggestions(
            space_id=org.id,
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


# ── Session init (chat widget open) ──────────────────────────────────────────

@router.post("/api/chat/{slug}/session/init", response_model=SessionInitResponse)
async def init_chat_session(slug: str):
    """
    Called by the frontend when the chat widget opens.

    Populates the agent cache and pre-builds the executor (Team for Agno,
    no-op for Dynamic) so the first message has no cold-start delay.
    Returns a session_id the frontend uses for the entire chat session.
    """
    from app.orchestra.ai.core.factory import build_executor

    try:
        org, chatbot, db = await _get_brand(slug)
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
        executor = build_executor(
            org=org,
            active_agents=active_agents,
            session_id=session_id,
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
async def get_session_history(slug: str, session_id: str):
    """Restore a chat session. Returns message history for frontend rendering."""
    org, chatbot, db = await _get_brand(slug)
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
        history = [
            {
                "role":       log.role,
                "message":    log.message,
                "agent_slug": log.agent_slug,
                "timestamp":  log.timestamp.isoformat() if log.timestamp else None,
            }
            for log in logs_result.scalars().all()
        ]
        await _set_history_cache(session_id, history, redis_client)
        return {"session_id": session_id, "history": history, **session_meta}
    finally:
        await db.close()

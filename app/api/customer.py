"""
Public customer-facing endpoints.

GET  /{slug}           — branded chat page (HTML)
POST /api/chat/{slug}  — stateless chat against a brand's active agents
"""

from __future__ import annotations

import time
import uuid
from typing import List, Optional

import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.org import Organization, AgentDefinition, ConversationLog
from app.models.chatbot import Chatbot

logger = structlog.get_logger()
router = APIRouter(tags=["Customer"])


# ── Request / Response ────────────────────────────────────────────────────────

class CustomerChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None    # client-generated, for multi-turn grouping
    conversation_id: Optional[str] = None


class CustomerChatResponse(BaseModel):
    reply: str
    agent: str
    intent: str
    session_id: str
    rag_hit: bool
    response_ms: int
    citations: List[dict] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_brand(slug: str):
    """
    Return (Organization, Chatbot, db) for the given org slug.
    Chatbot is the org's default chatbot (is_default=True).
    Raises 404 if org not found/inactive or no default chatbot configured.
    """
    from app.core.database import AsyncSessionLocal
    db = AsyncSessionLocal()
    result = await db.execute(
        select(Organization).where(Organization.slug == slug, Organization.active == True)
    )
    org = result.scalar_one_or_none()
    if not org:
        await db.close()
        raise HTTPException(404, f"Brand '{slug}' not found.")

    # Resolve default chatbot for this org
    cb_result = await db.execute(
        select(Chatbot).where(
            Chatbot.org_id == org.id,
            Chatbot.is_default == True,
            Chatbot.active == True,
        )
    )
    chatbot = cb_result.scalar_one_or_none()
    if not chatbot:
        await db.close()
        raise HTTPException(503, f"No active chatbot configured for '{slug}'.")

    return org, chatbot, db


async def _get_active_agents(db: AsyncSession, chatbot_id: uuid.UUID) -> list[AgentDefinition]:
    """Return active agents scoped to the given chatbot."""
    result = await db.execute(
        select(AgentDefinition).where(
            AgentDefinition.chatbot_id == chatbot_id,
            AgentDefinition.active == True,
        )
    )
    return result.scalars().all()


# ── Customer chat page (HTML) ─────────────────────────────────────────────────

_CHAT_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>{brand_name} — Support</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;display:flex;flex-direction:column;height:100vh}}
    header{{background:{theme_color};color:#fff;padding:16px 24px;display:flex;align-items:center;gap:12px}}
    header img{{width:36px;height:36px;border-radius:8px;object-fit:cover}}
    header h1{{font-size:1.1rem;font-weight:600}}
    #chat{{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:12px}}
    .msg{{max-width:70%;padding:12px 16px;border-radius:12px;line-height:1.5;font-size:.9rem}}
    .user{{align-self:flex-end;background:{theme_color};color:#fff;border-bottom-right-radius:4px}}
    .ai{{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px}}
    .agent-label{{font-size:.7rem;opacity:.6;margin-bottom:4px}}
    form{{padding:16px 24px;background:#fff;border-top:1px solid #e2e8f0;display:flex;gap:8px}}
    input{{flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;outline:none}}
    input:focus{{border-color:{theme_color}}}
    button{{padding:10px 20px;background:{theme_color};color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:500}}
    button:disabled{{opacity:.5;cursor:default}}
    .typing{{display:flex;gap:4px;align-items:center;padding:10px 14px}}
    .dot{{width:6px;height:6px;background:#94a3b8;border-radius:50%;animation:bounce .8s infinite}}
    .dot:nth-child(2){{animation-delay:.15s}}
    .dot:nth-child(3){{animation-delay:.3s}}
    @keyframes bounce{{0%,100%{{transform:translateY(0)}}50%{{transform:translateY(-5px)}}}}
  </style>
</head>
<body>
  <header>
    {logo_img}
    <h1>{brand_name} Support</h1>
  </header>
  <div id="chat"></div>
  <form id="form">
    <input id="msg" placeholder="How can we help you?" autocomplete="off"/>
    <button id="btn" type="submit">Send</button>
  </form>
  <script>
    const SLUG = "{slug}";
    const SESSION_ID = crypto.randomUUID();
    const chat = document.getElementById("chat");
    const form = document.getElementById("form");
    const input = document.getElementById("msg");
    const btn   = document.getElementById("btn");

    function addMsg(text, role, agentLabel) {{
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = role === "user" ? "flex-end" : "flex-start";
      if (agentLabel) {{
        const lbl = document.createElement("div");
        lbl.className = "agent-label";
        lbl.textContent = agentLabel;
        wrap.appendChild(lbl);
      }}
      const div = document.createElement("div");
      div.className = "msg " + role;
      div.textContent = text;
      wrap.appendChild(div);
      chat.appendChild(wrap);
      chat.scrollTop = chat.scrollHeight;
      return div;
    }}

    function showTyping() {{
      const div = document.createElement("div");
      div.className = "msg ai typing";
      div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      return div;
    }}

    form.addEventListener("submit", async (e) => {{
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      btn.disabled = true;
      addMsg(text, "user");
      const typing = showTyping();
      try {{
        const res = await fetch("/api/chat/" + SLUG, {{
          method: "POST",
          headers: {{"Content-Type": "application/json"}},
          body: JSON.stringify({{message: text, session_id: SESSION_ID}}),
        }});
        const data = await res.json();
        typing.remove();
        addMsg(data.reply || data.detail || "Sorry, something went wrong.", "ai",
               data.agent ? "🤖 " + data.agent.replace(/_/g, " ") : "");
      }} catch(err) {{
        typing.remove();
        addMsg("Connection error. Please try again.", "ai");
      }} finally {{
        btn.disabled = false;
        input.focus();
      }}
    }});
  </script>
</body>
</html>
"""


@router.get("/{slug}", response_class=HTMLResponse)
async def customer_chat_page(slug: str):
    """Serve the branded customer chat page."""
    org, chatbot, db = await _get_brand(slug)
    # Chatbot branding takes precedence over org branding
    logo_url    = chatbot.logo_url    or org.logo_url
    theme_color = chatbot.theme_color or org.theme_color or "#6366f1"
    logo_img = f'<img src="{logo_url}" alt="logo"/>' if logo_url else ""
    html = _CHAT_PAGE_TEMPLATE.format(
        brand_name=chatbot.display_name or org.display_name,
        theme_color=theme_color,
        logo_img=logo_img,
        slug=slug,
    )
    await db.close()
    return HTMLResponse(html)


# ── Customer chat API ─────────────────────────────────────────────────────────

@router.post("/api/chat/{slug}", response_model=CustomerChatResponse)
async def customer_chat(slug: str, req: CustomerChatRequest):
    """
    Route a customer message through the brand's active agents.
    Uses DynamicAgentExecutor when available; falls back to built-in routing.
    """
    from app.agents.dynamic_executor import DynamicAgentExecutor

    org, chatbot, db = await _get_brand(slug)
    t0 = time.time()

    # session_id from client is the chat_sessions.id UUID string
    # If not provided, we'll assign one after creating the ChatSession row
    incoming_session_id = req.session_id

    try:
        active_agents = await _get_active_agents(db, chatbot.id)

        # MCP data source integration — disabled for now, enable when ready
        # from app.mcp.datasource_server import DataSourceMCPServer
        # mcp_server = DataSourceMCPServer(db=db, org_id=org.id)
        # await mcp_server.load()

        executor = DynamicAgentExecutor(org=org, active_agents=active_agents, mcp_server=None)
        result = await executor.run(
            message=req.message,
            session_id=incoming_session_id or "new",
            conversation_id=req.conversation_id or incoming_session_id or "new",
        )

        elapsed_ms = int((time.time() - t0) * 1000)

        agent_slug = result.get("agent", "unknown")

        from app.models.chat import ChatSession
        from datetime import datetime

        # Upsert chat_sessions — id IS the session identifier
        chat_session = None
        if incoming_session_id:
            try:
                sess_result = await db.execute(
                    select(ChatSession).where(
                        ChatSession.id == uuid.UUID(incoming_session_id),
                        ChatSession.org_id == org.id,
                    )
                )
                chat_session = sess_result.scalar_one_or_none()
            except ValueError:
                pass  # invalid UUID — treat as new session

        if not chat_session:
            chat_session = ChatSession(
                org_id=org.id,
                chatbot_id=chatbot.id,
                title=req.message[:100].strip(),
                agent_slug=agent_slug,
                status="open",
                message_count=1,
            )
            db.add(chat_session)
            await db.flush()  # get chat_session.id before using it
        else:
            chat_session.agent_slug      = agent_slug
            chat_session.message_count   = (chat_session.message_count or 0) + 1
            chat_session.last_message_at = datetime.utcnow()

        # canonical session_id = str(chat_session.id)
        session_id = str(chat_session.id)

        # Log both turns in the same transaction
        db.add(ConversationLog(
            org_id=org.id,
            chatbot_id=chatbot.id,
            session_id=session_id,
            role="user",
            message=req.message,
            intent=result.get("intent"),
            agent_slug=agent_slug,
            rag_hit=result.get("rag_hit", False),
            response_ms=elapsed_ms,
        ))
        db.add(ConversationLog(
            org_id=org.id,
            chatbot_id=chatbot.id,
            session_id=session_id,
            role="assistant",
            message=result.get("reply", ""),
            intent=result.get("intent"),
            agent_slug=agent_slug,
        ))
        await db.commit()

        # Refresh Redis TTL for active session
        from app.core.redis import redis_client
        from app.api.v1.chat_sessions import _history_key, HISTORY_TTL
        await redis_client.expire(_history_key(session_id), HISTORY_TTL)

        return CustomerChatResponse(
            reply=result.get("reply", ""),
            agent=result.get("agent", "unknown"),
            intent=result.get("intent", "unknown"),
            session_id=session_id,
            rag_hit=result.get("rag_hit", False),
            response_ms=elapsed_ms,
            citations=result.get("citations", []),
        )

    finally:
        await db.close()


# ── Chat suggestions ─────────────────────────────────────────────────────────

@router.get("/api/chat/{slug}/suggestions")
async def get_chat_suggestions(slug: str):
    """Return 4 AI-generated suggestion chips for the customer chat page."""
    from app.utils.ai.chat_suggestions import get_suggestions
    from app.rag.vector_store import get_vector_store

    org, chatbot, db = await _get_brand(slug)
    try:
        try:
            active_agents = await _get_active_agents(db, chatbot.id)
            store = get_vector_store()
            doc_types = store.get_org_doc_types(str(org.id))
        except Exception:
            active_agents, doc_types = [], []
        suggestions = await get_suggestions(
            org_id=org.id,
            org_name=org.display_name,
            active_agents=active_agents,
            doc_types=doc_types,
        )
        return {"suggestions": suggestions}
    except Exception:
        from app.utils.ai.chat_suggestions import _FALLBACKS
        return {"suggestions": _FALLBACKS}
    finally:
        await db.close()


# ── Public session restore ─────────────────────────────────────────────────────

@router.get("/api/chat/{slug}/session/{session_id}")
async def get_session_history(slug: str, session_id: str):
    """
    Public endpoint — restore a chat session by slug + session_id.
    Returns message history so the frontend can render past messages.
    """
    org, chatbot, db = await _get_brand(slug)
    try:
        # Verify this session belongs to this org
        from app.models.chat import ChatSession
        try:
            sess_uuid = uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(400, "Invalid session id.")
        sess_result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == sess_uuid,
                ChatSession.org_id == org.id,
            )
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            raise HTTPException(404, "Session not found.")

        # Try Redis cache first
        from app.core.redis import redis_client
        from app.api.v1.chat_sessions import _history_key, _set_history_cache
        cached = await redis_client.get(_history_key(session_id))
        if cached is not None:
            return {"session_id": session_id, "history": cached}

        # Fall back to DB
        logs_result = await db.execute(
            select(ConversationLog)
            .where(ConversationLog.session_id == session_id)
            .order_by(ConversationLog.timestamp)
        )
        logs = logs_result.scalars().all()
        history = [
            {
                "role":      log.role,
                "message":   log.message,
                "agent_slug": log.agent_slug,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            }
            for log in logs
        ]
        await _set_history_cache(session_id, history, redis_client)
        return {"session_id": session_id, "history": history}
    finally:
        await db.close()

"""
Escalation endpoint — triggered from the customer side.

POST /inbox/escalate
  Called when:
  - Customer clicks "Talk to a human" button
  - AI agent calls request_human_support tool (chat endpoint detects __ESCALATE__)
"""

from __future__ import annotations

import structlog
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.chat import ChatSession
from app.services.inbox.transfer_service import transfer_to_staff

logger = structlog.get_logger()
router = APIRouter(prefix="/inbox", tags=["Inbox — Escalation"])


class EscalateRequest(BaseModel):
    session_id: UUID
    reason: Optional[str] = "customer_request"   # customer_request | agent_failed | sentiment
    last_message: Optional[str] = ""


@router.post("/escalate")
async def escalate_session(
    req: EscalateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Transfer a session to a human agent.
    Sets ai_disabled=True so the AI stops auto-responding.
    """
    # Verify session exists (no auth — called from public chat widget)
    from sqlalchemy.orm import selectinload
    from app.models.chatbot import Chatbot
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == req.session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found.")

    # Check chatbot-level human transfer toggle
    transfer_message = "You're being connected to a human agent. Please hold on."
    if session.chatbot_id:
        cb_result = await db.execute(
            select(Chatbot).where(Chatbot.id == session.chatbot_id)
        )
        chatbot = cb_result.scalar_one_or_none()
        if chatbot:
            if not chatbot.human_transfer_enabled:
                raise HTTPException(403, "Human transfer is not enabled for this chatbot.")
            if chatbot.human_transfer_message:
                transfer_message = chatbot.human_transfer_message

    outcome = await transfer_to_staff(
        db=db,
        session_id=req.session_id,
        source="customer_request",
        escalation_reason=req.reason,
        last_customer_message=req.last_message or "",
    )

    return {
        "result": outcome,
        "session_id": str(req.session_id),
        "message": transfer_message,
    }

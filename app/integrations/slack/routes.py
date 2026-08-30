"""
app/integrations/slack/routes.py — Slack Interactive Actions Webhook Router

This module defines endpoints to process incoming Slack interactive block actions,
such as when an internal staff member clicks "Take Over Ticket" from Slack.
"""

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import json
import structlog
from datetime import datetime

from app.core.database import get_db
from app.models.chat import ChatSession

logger = structlog.get_logger()
router = APIRouter(prefix="/slack", tags=["Slack Integration"])


@router.post("/actions")
async def slack_actions_receiver(
    payload: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint that receives interactive form submissions from Slack.
    """
    logger.info("Received interactive action webhook from Slack")
    
    try:
        data = json.loads(payload)
    except Exception as e:
        logger.error("Failed to parse Slack interactive action payload JSON", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid payload JSON")

    # Bind request context for logging
    user_info = data.get("user") or {}
    logger.info("Parsing Slack user action", slack_username=user_info.get("username"), slack_user_id=user_info.get("id"))

    actions = data.get("actions") or []
    if not actions:
        logger.warning("No action tags found in Slack callback payload")
        return {"status": "ignored"}

    action = actions[0]
    action_id = action.get("action_id")
    session_id = action.get("value")

    log = logger.bind(action_id=action_id, session_id=session_id)

    if action_id == "take_over_ticket":
        log.info("Processing ticket takeover request from Slack")
        
        # 1. Update the ChatSession in the database
        session_result = await db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = session_result.scalar_one_or_none()
        
        if not session:
            log.error("Failed to find ChatSession associated with takeover alert")
            return {
                "text": "❌ Error: Chat session not found. It might have been deleted."
            }

        if session.ai_disabled:
            log.info("ChatSession is already taken over by another staff member")
            return {
                "text": f"⚠️ Ticket is already claimed and assigned to a human staff member."
            }

        # Update status to escalated, disabling the AI auto-reply
        session.ai_disabled = True
        session.status = "escalated"
        session.escalated_at = datetime.utcnow()
        session.escalation_reason = f"Slack takeover by {user_info.get('name', 'Slack User')}"
        
        await db.commit()
        log.info("Session status successfully updated to escalated via Slack takeover")

        # 2. Return confirmation message back to Slack to replace the button block
        return {
            "text": f"✅ *Ticket Taken Over* by <@{user_info.get('id')}> at {datetime.utcnow().strftime('%H:%M:%S UTC')}."
        }

    return {"status": "unsupported_action"}

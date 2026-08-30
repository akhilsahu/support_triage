"""
app/integrations/whatsapp/routes.py — WhatsApp Webhook Router

This module defines endpoints to:
1. Verify Meta's Webhook verification challenge (GET).
2. Receive incoming customer messages from Meta's API and route them to services (POST).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
import structlog
import os

from app.core.database import get_db
from app.integrations.whatsapp.service import handle_incoming_whatsapp_message

logger = structlog.get_logger()
router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Integration"])


@router.get("/webhook", response_class=PlainTextResponse)
async def whatsapp_webhook_verification(
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_verify_token: str = Query(..., alias="hub.verify_token")
):
    """
    Verification endpoint called by Meta when subscribing webhooks.
    """
    logger.info(
        "Received WhatsApp webhook verification request",
        mode=hub_mode,
        verify_token=hub_verify_token
    )

    # In production, we compare this against the merchant's configured webhook token
    expected_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "super_secret_webhook_verify_token_123")

    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        logger.info("WhatsApp Webhook verified successfully")
        return hub_challenge
    else:
        logger.warning("WhatsApp Webhook verification failed due to token mismatch")
        raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/webhook")
async def whatsapp_webhook_receiver(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Receiver endpoint for all incoming WhatsApp events (messages, status updates).
    """
    payload = await request.json()
    logger.info("Received WhatsApp webhook POST payload")

    # Meta sometimes sends status notifications (sent, delivered, read) in the same webhook.
    # We filter for messages to ensure we only trigger agent runs for actual text content.
    entry = payload.get("entry") or []
    if entry:
        changes = entry[0].get("changes") or []
        if changes:
            value = changes[0].get("value") or {}
            # Check if this payload contains messaging content
            if "messages" in value:
                logger.info("Incoming WhatsApp message event detected")
                await handle_incoming_whatsapp_message(payload, db)
            elif "statuses" in value:
                logger.info("WhatsApp delivery status update ignored")
            else:
                logger.info("Ignored general WhatsApp webhook payload change event")

    return {"status": "success"}

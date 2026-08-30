"""
app/integrations/shopify/routes.py — Shopify Webhook and Configuration Endpoints

This module defines FastAPI endpoints that receive and verify Shopify webhook events,
delegating processing to the service module to ensure strict decoupling.
"""

import hmac
import hashlib
import base64
from fastapi import APIRouter, Header, HTTPException, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.database import get_db
from app.integrations.shopify.service import handle_shopify_order_update

logger = structlog.get_logger()
router = APIRouter(prefix="/shopify", tags=["Shopify Integration"])


def verify_shopify_hmac(body: bytes, hmac_header: str, shared_secret: str) -> bool:
    """
    Verify that the webhook request came from Shopify by calculating HMAC-SHA256
    over the raw request body and comparing it to the base64-encoded header value.
    """
    if not shared_secret:
        logger.error("Shopify client secret not configured, rejecting signature verification")
        return False
        
    try:
        calculated_hmac = hmac.new(
            shared_secret.encode("utf-8"),
            body,
            hashlib.sha256
        ).digest()
        encoded_calculated = base64.b64encode(calculated_hmac)
        
        return hmac.compare_digest(encoded_calculated, hmac_header.encode("utf-8"))
    except Exception as e:
        logger.error("HMAC verification failed with exception", error=str(e))
        return False


@router.post("/webhook")
async def shopify_webhook(
    request: Request,
    x_shopify_hmac_sha256: str = Header(...),
    x_shopify_topic: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Public webhook receiver endpoint for Shopify events.
    Verifies signature and processes the payload.
    """
    # Parse raw body for signature verification
    body = await request.body()
    
    # Retrieve webhook secret from config (in production, loaded from database per space_id)
    # For now, we fetch a global test setting, falling back to a dummy string if missing
    import os
    shopify_secret = os.getenv("SHOPIFY_WEBHOOK_SECRET", "dummy_secret_for_tests")

    log = logger.bind(topic=x_shopify_topic, hmac_header=x_shopify_hmac_sha256)
    log.info("Received Shopify Webhook")

    if not verify_shopify_hmac(body, x_shopify_hmac_sha256, shopify_secret):
        log.warning("Unauthorized Shopify webhook signature rejected")
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    data = await request.json()
    
    # Delegate logic to services based on the event topic
    if x_shopify_topic in ("orders/create", "orders/updated"):
        log.info("Processing order sync webhook")
        await handle_shopify_order_update(data, db)
    else:
        log.info("Ignored unsupported Shopify webhook topic")
        
    return {"status": "accepted"}

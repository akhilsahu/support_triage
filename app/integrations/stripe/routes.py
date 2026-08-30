"""
app/integrations/stripe/routes.py — Stripe Webhook Router

This module defines endpoints to process incoming Stripe webhook events with HMAC signature validation.
"""

import hmac
import hashlib
from fastapi import APIRouter, Header, HTTPException, Request
import structlog
import os

from app.integrations.stripe.service import process_invoice_paid

logger = structlog.get_logger()
router = APIRouter(prefix="/stripe", tags=["Stripe Integration"])


def verify_stripe_signature(body: bytes, signature_header: str, webhook_secret: str) -> bool:
    """
    Verify Stripe webhook signature.
    Signature header format: t=1492774577,v1=5257a869e7ece...
    We sign the string 't_value.body_bytes' using HMAC-SHA256 with the secret.
    """
    if not webhook_secret:
        logger.error("Stripe webhook secret not configured, rejecting signature")
        return False

    try:
        # 1. Parse header
        parts = {p.split("=")[0]: p.split("=")[1] for p in signature_header.split(",") if "=" in p}
        timestamp = parts.get("t")
        signature_v1 = parts.get("v1")

        if not timestamp or not signature_v1:
            logger.warning("Stripe signature header is missing t or v1 fields")
            return False

        # 2. Reconstruct signature payload: t_value.body_bytes
        signed_payload = f"{timestamp}.".encode("utf-8") + body

        # 3. Calculate HMAC-SHA256
        calculated_mac = hmac.new(
            webhook_secret.encode("utf-8"),
            signed_payload,
            hashlib.sha256
        ).hexdigest()

        # 4. Compare securely
        return hmac.compare_digest(calculated_mac, signature_v1)
    except Exception as e:
        logger.error("Failed to verify Stripe signature with exception", error=str(e))
        return False


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(...)
):
    """
    Public webhook receiver endpoint for Stripe events.
    Verifies signature and processes paid invoices.
    """
    body = await request.body()
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "dummy_secret_for_tests")

    log = logger.bind(signature=stripe_signature)
    log.info("Received Stripe Webhook")

    if not verify_stripe_signature(body, stripe_signature, webhook_secret):
        log.warning("Unauthorized Stripe webhook signature rejected")
        raise HTTPException(status_code=401, detail="Invalid Stripe signature")

    try:
        data = await request.json()
    except Exception as e:
        logger.error("Failed to parse Stripe body JSON", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid body JSON")

    event_type = data.get("type")
    log.info("Stripe signature verified successfully", event_type=event_type)

    if event_type == "invoice.paid":
        # Process paid billing details
        await process_invoice_paid(data.get("data", {}).get("object", {}))
    else:
        log.info("Ignored unsupported Stripe webhook event type")

    return {"status": "success"}

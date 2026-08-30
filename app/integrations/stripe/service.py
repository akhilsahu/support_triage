"""
app/integrations/stripe/service.py — Stripe Integration Business Logic

This module handles processing Stripe webhook events, issuing refunds using
StripeClient, and enforcing transaction rules (like dollar threshold limits).
"""

from typing import Dict, Any, Optional
import structlog
import os

from app.integrations.stripe.client import StripeClient
from app.services.crm_service import get_crm_service

logger = structlog.get_logger()
crm_service = get_crm_service()


async def process_invoice_paid(payload: Dict[str, Any]) -> None:
    """
    Process raw stripe payload for invoice payments.
    """
    invoice_id = payload.get("id")
    customer_id = payload.get("customer")
    amount_paid = payload.get("amount_paid")
    
    log = logger.bind(invoice_id=invoice_id, customer_id=customer_id, amount=amount_paid)
    log.info("Processing Stripe invoice.paid event")
    
    # Update user billing profile or log transaction inside the CRM system
    try:
        await crm_service.log_action(
            ticket_id="SYSTEM-BILLING",
            action_type="billing_received",
            agent_id="stripe-webhook",
            agent_type="system",
            details={
                "invoice_id": invoice_id,
                "customer_id": customer_id,
                "amount": f"${amount_paid / 100:.2f}" if amount_paid else "$0.00"
            }
        )
        log.info("Billing action logged to CRM audit trail successfully")
    except Exception as e:
        log.error("Failed to log billing action to CRM", error=str(e))


async def execute_customer_refund(
    space_id: str,
    charge_id: str,
    amount_cents: int,
    reason: str
) -> Dict[str, Any]:
    """
    Check authorization limits and issue a refund using Stripe API.
    
    If the amount exceeds the merchant's configured threshold,
    we flag this refund for manual manager approval instead of processing.
    """
    log = logger.bind(charge_id=charge_id, amount=amount_cents)
    log.info("Executing Stripe customer refund transaction request")

    # Fetch max limit threshold (default: $50.00 = 5000 cents)
    max_threshold = int(os.getenv("STRIPE_MAX_REFUND_LIMIT_CENTS", "5000"))

    if amount_cents > max_threshold:
        log.warning(
            "Refund amount exceeds autonomous threshold limit. Requiring manual approval.",
            threshold=max_threshold
        )
        return {
            "success": False,
            "status": "pending_approval",
            "reason": f"Refund of ${amount_cents/100:.2f} exceeds threshold limit of ${max_threshold/100:.2f}."
        }

    # Fetch merchant Restricted Key
    stripe_key = os.getenv("STRIPE_RESTRICTED_KEY")
    if not stripe_key:
        log.error("STRIPE_RESTRICTED_KEY is not configured")
        return {"success": False, "status": "error", "reason": "Billing integration credentials missing"}

    client = StripeClient(restricted_key=stripe_key)

    try:
        res = await client.create_refund(charge_id=charge_id, amount_cents=amount_cents, reason=reason)
        
        # Log to CRM system
        await crm_service.log_action(
            ticket_id=f"REFUND-{charge_id[:6].upper()}",
            action_type="refund_processed",
            agent_id="stripe-agent",
            agent_type="finance",
            details={
                "refund_id": res.get("id"),
                "charge_id": charge_id,
                "amount": f"${amount_cents/100:.2f}"
            }
        )
        
        log.info("Refund completed successfully and logged to CRM")
        return {
            "success": True,
            "status": "succeeded",
            "refund_id": res.get("id")
        }
    except Exception as e:
        log.error("Stripe refund request execution failed", error=str(e))
        return {
            "success": False,
            "status": "failed",
            "reason": str(e)
        }

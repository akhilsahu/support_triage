"""
Stripe Preset Builder — compiles Stripe tools into a reusable inward Data Source preset.
"""

from __future__ import annotations

from typing import Any, Dict
import structlog

logger = structlog.get_logger(__name__)


def get_stripe_preset() -> Dict[str, Any]:
    """
    Returns the complete Stripe Data Source preset configuration.
    """
    logger.info("Generating Stripe data source preset")

    tools = [
        {
            "name": "stripe_get_invoice",
            "display_name": "Get Stripe Invoice by ID",
            "description": "Retrieve status, amount due, and customer payment details for a Stripe invoice.",
            "method": "GET",
            "path": "/v1/invoices/{invoice_id}",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "invoice_id": {
                        "type": "string",
                        "description": "The unique Stripe invoice ID starting with in_"
                    }
                },
                "required": ["invoice_id"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {},
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "customer": "customer",
                "amount_due": "amount_due",
                "amount_paid": "amount_paid",
                "status": "status",
                "hosted_invoice_url": "hosted_invoice_url"
            }
        },
        {
            "name": "stripe_get_customer",
            "display_name": "Get Stripe Customer Profile",
            "description": "Retrieve customer email, subscription status, and account balance from Stripe.",
            "method": "GET",
            "path": "/v1/customers/{customer_id}",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The unique Stripe customer ID starting with cus_"
                    }
                },
                "required": ["customer_id"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {},
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "email": "email",
                "name": "name",
                "balance": "balance",
                "currency": "currency"
            }
        }
    ]

    return {
        "id": "stripe",
        "slug": "stripe",
        "name": "Stripe Billing",
        "category": "Payments & Billing",
        "description": "Check customer invoice status, verify subscription states, and query payment details.",
        "icon": "credit-card",
        "api_version": "v1",
        "base_url_template": "https://api.stripe.com",
        "auth_type": "bearer",
        "auth_header": "Authorization",
        "required_credentials": [
            {
                "name": "access_token",
                "label": "Stripe Restricted Secret Key",
                "type": "password",
                "placeholder": "rk_live_xxxxxxxxxxxxxxxx",
                "required": True,
                "help": "Generated in Stripe Dashboard > Developers > API Keys"
            }
        ],
        "default_tool": tools[0],
        "tools": tools
    }

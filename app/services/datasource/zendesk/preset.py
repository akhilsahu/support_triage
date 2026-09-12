"""
Zendesk Preset Builder — compiles Zendesk tools into a reusable inward Data Source preset.
"""

from __future__ import annotations

from typing import Any, Dict
import structlog

logger = structlog.get_logger(__name__)


def get_zendesk_preset() -> Dict[str, Any]:
    """
    Returns the complete Zendesk Data Source preset configuration.
    """
    logger.info("Generating Zendesk data source preset")

    tools = [
        {
            "name": "zendesk_get_ticket",
            "display_name": "Get Zendesk Ticket by ID",
            "description": "Fetch status, subject, priority, and updates for a specific Zendesk ticket.",
            "method": "GET",
            "path": "/api/v2/tickets/{ticket_id}.json",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ticket_id": {
                        "type": "string",
                        "description": "The unique numerical Zendesk ticket ID"
                    }
                },
                "required": ["ticket_id"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {},
                "headers": {},
                "body": {}
            },
            "record_path": "ticket",
            "output_mapping": {
                "id": "ticket.id",
                "subject": "ticket.subject",
                "status": "ticket.status",
                "priority": "ticket.priority",
                "requester_id": "ticket.requester_id",
                "created_at": "ticket.created_at"
            }
        }
    ]

    return {
        "id": "zendesk",
        "slug": "zendesk",
        "name": "Zendesk Support",
        "category": "Customer Support CRM",
        "description": "Look up support ticket history, status updates, and customer profiles on Zendesk.",
        "icon": "life-buoy",
        "api_version": "v2",
        "base_url_template": "https://{subdomain}.zendesk.com",
        "auth_type": "basic",
        "auth_header": "Authorization",
        "required_credentials": [
            {
                "name": "subdomain",
                "label": "Zendesk Subdomain",
                "type": "text",
                "placeholder": "mybrand",
                "required": True,
                "help": "Your Zendesk subdomain (e.g. brand from brand.zendesk.com)"
            },
            {
                "name": "email",
                "label": "Admin Email",
                "type": "text",
                "placeholder": "admin@mybrand.com",
                "required": True,
                "help": "Email address of your Zendesk admin user"
            },
            {
                "name": "api_token",
                "label": "API Token",
                "type": "password",
                "placeholder": "xxxxxxxxxxxxxxxxxxxxxxxx",
                "required": True,
                "help": "Generated in Zendesk Admin Center > Apps and Integrations > APIs"
            }
        ],
        "default_tool": tools[0],
        "tools": tools
    }

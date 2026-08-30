"""
app/integrations/slack/service.py — Slack Integration Business Logic

This module handles formatting alerts with Slack Block Kit (interactive layouts)
and posting notifications for human agent takeover events.
"""

from typing import Dict, Any, Optional
import structlog
import os

from app.integrations.slack.client import SlackClient

logger = structlog.get_logger()


async def trigger_slack_escalation_alert(
    space_name: str,
    session_id: str,
    customer_name: str,
    issue_preview: str
) -> bool:
    """
    Format and publish an interactive escalation alert block to Slack.
    Provides a button allowing internal staff members to take over the chat.
    """
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        logger.warning("SLACK_WEBHOOK_URL not configured. Skipping Slack alert.")
        return False

    client = SlackClient(webhook_url=webhook_url)

    # 1. Compose Slack Block Kit payload
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🚨 Urgent Support Escalation",
                "emoji": True
            }
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Organization:*\n{space_name}"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Customer:*\n{customer_name}"
                }
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Last Message:*\n`{issue_preview}`"
            }
        },
        {
            "type": "divider"
        },
        {
            "type": "actions",
            "block_id": "escalation_actions",
            "elements": [
                {
                    "type": "button",
                    "action_id": "take_over_ticket",
                    "text": {
                        "type": "plain_text",
                        "text": "Take Over Ticket 🙋‍♂️",
                        "emoji": True
                    },
                    "style": "primary",
                    "value": session_id  # Session ID passed back during callback
                }
            ]
        }
    ]

    payload = {
        "text": f"Urgent Support Escalation for {customer_name}",
        "blocks": blocks
    }

    logger.info("Triggering Slack alert Block Kit notification", session_id=session_id)
    return await client.post_to_webhook(payload)

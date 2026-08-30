"""
app/integrations/slack/client.py — Slack API and Block Kit publisher

This module handles sending alerts and interactive message blocks to Slack channels.
"""

from typing import Dict, Any, List, Optional
import httpx
import structlog

logger = structlog.get_logger()


class SlackClient:
    """
    Client wrapper for publishing interactive alerts to Slack.
    """

    def __init__(self, webhook_url: Optional[str] = None, bot_token: Optional[str] = None):
        """
        Initialize the Slack Client.

        Args:
            webhook_url: Incoming webhook URL for standard notifications.
            bot_token: Bot User OAuth Token (xoxb-***) for active chat and calls.
        """
        self.webhook_url = webhook_url
        self.bot_token = bot_token
        self.base_url = "https://slack.com/api"
        self.headers = {}
        if bot_token:
            self.headers = {
                "Authorization": f"Bearer {bot_token}",
                "Content-Type": "application/json; charset=utf-8"
            }
        self.log = logger.bind()

    async def post_to_webhook(self, payload: Dict[str, Any]) -> bool:
        """
        Publish a raw payload (such as Block Kit) using the configured incoming webhook.
        """
        if not self.webhook_url:
            self.log.error("Slack Webhook URL is not configured")
            return False

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(self.webhook_url, json=payload)
                response.raise_for_status()
                self.log.info("Posted notification webhook to Slack channel")
                return True
            except Exception as e:
                self.log.error("Failed to post message to Slack webhook", error=str(e))
                return False

    async def post_message(self, channel: str, text: str, blocks: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Send a chat message to a specific Slack channel using the Bot Token.
        """
        if not self.bot_token:
            self.log.error("Slack Bot OAuth Token is not configured")
            return {"success": False, "error": "Bot token missing"}

        url = f"{self.base_url}/chat.postMessage"
        payload = {
            "channel": channel,
            "text": text
        }
        if blocks:
            payload["blocks"] = blocks

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers)
                response.raise_for_status()
                res_data = response.json()
                
                if not res_data.get("ok"):
                    self.log.error("Slack API returned error", error_msg=res_data.get("error"))
                    return {"success": False, "error": res_data.get("error")}
                    
                self.log.info("Posted chat.postMessage to Slack channel", channel=channel)
                return {"success": True, "message_ts": res_data.get("ts"), "raw_response": res_data}
            except Exception as e:
                self.log.error("Failed to send message via Slack postMessage API", error=str(e))
                return {"success": False, "error": str(e)}

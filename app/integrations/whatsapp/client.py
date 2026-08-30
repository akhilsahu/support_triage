"""
app/integrations/whatsapp/client.py — WhatsApp Meta Cloud API client wrapper

This module handles sending text messages back to customers using Meta's Graph API.
It implements the BaseMessagingChannel interface.
"""

from typing import Dict, Any, Optional
import httpx
import structlog

from app.integrations.base import BaseMessagingChannel

logger = structlog.get_logger()


class WhatsAppClient(BaseMessagingChannel):
    """
    Client wrapper for Meta WhatsApp Cloud API messaging.
    """

    def __init__(self, phone_number_id: str, access_token: str, api_version: str = "v18.0"):
        """
        Initialize the WhatsApp Client.

        Args:
            phone_number_id: Meta-assigned Phone Number ID.
            access_token: Long-lived System User Access Token.
            api_version: Meta Graph API version.
        """
        super().__init__(provider_name="whatsapp")
        self.phone_number_id = phone_number_id
        self.base_url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        self.log = logger.bind(phone_number_id=phone_number_id)

    async def parse_incoming_payload(self, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse Meta's webhook format into a normalized system message payload.
        """
        try:
            entry = raw_payload.get("entry") or []
            if not entry:
                raise KeyError("Missing 'entry' list in payload")
                
            changes = entry[0].get("changes") or []
            if not changes:
                raise KeyError("Missing 'changes' list in payload")
                
            value = changes[0].get("value") or {}
            messages = value.get("messages") or []
            if not messages:
                raise KeyError("No messages found in value payload")

            msg = messages[0]
            sender_id = msg.get("from")  # E.164 phone number of user
            message_text = msg.get("text", {}).get("body", "")
            message_id = msg.get("id")

            self.log.info(
                "Parsed incoming WhatsApp message",
                sender=sender_id,
                message_id=message_id,
                text_length=len(message_text)
            )

            return {
                "sender_id": sender_id,
                "message_text": message_text,
                "message_id": message_id,
                "raw_payload": raw_payload
            }
        except KeyError as e:
            self.log.error("Failed to parse WhatsApp webhook keys", error=str(e))
            raise Exception(f"Invalid WhatsApp webhook structure: {str(e)}")

    async def send_message(
        self,
        recipient_id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send a text message back to the customer on WhatsApp.
        """
        self.log.info("Sending outbound WhatsApp message", recipient=recipient_id)

        # Meta message payload structure for text messages
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_id,
            "type": "text",
            "text": {
                "preview_url": True,
                "body": text
            }
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(
                    self.base_url,
                    json=payload,
                    headers=self.headers
                )
                response.raise_for_status()
                res_data = response.json()
                
                self.log.info(
                    "WhatsApp message sent successfully",
                    recipient=recipient_id,
                    whatsapp_msg_id=res_data.get("messages", [{}])[0].get("id")
                )
                return {
                    "success": True,
                    "provider_message_id": res_data.get("messages", [{}])[0].get("id"),
                    "raw_response": res_data
                }
            except httpx.HTTPStatusError as e:
                self.log.error(
                    "Meta API returned error status",
                    status_code=e.response.status_code,
                    response_text=e.response.text[:500]
                )
                return {
                    "success": False,
                    "error": f"Meta API Error: {e.response.text[:200]}"
                }
            except Exception as e:
                self.log.error("Failed to send WhatsApp message", error=str(e))
                return {
                    "success": False,
                    "error": str(e)
                }

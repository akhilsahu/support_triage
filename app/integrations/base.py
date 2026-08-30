"""
app/integrations/base.py — Abstract Base Classes for Support247 Integrations

This module defines unified contracts for two categories of integrations:
1. Messaging Channels (e.g., WhatsApp, Slack, Discord)
2. Data Sources / Providers (e.g., Shopify, Stripe, Zendesk)

By defining these strict abstract interfaces, we ensure complete decoupling
between third-party provider schemas and the core chatbot logic.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import structlog

logger = structlog.get_logger()


class BaseMessagingChannel(ABC):
    """
    Unified abstract interface that all external messaging platforms must implement.
    Handles message normalization, validation, and delivery.
    """

    def __init__(self, provider_name: str):
        self.provider_name = provider_name
        self.log = logger.bind(integration_provider=provider_name)

    @abstractmethod
    async def parse_incoming_payload(self, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse and normalize raw provider webhooks into a unified format.
        
        Expected output format:
        {
            "sender_id": str,       # Platform-specific unique customer ID (e.g., phone, user_id)
            "message_text": str,    # Raw message content
            "message_id": str,      # Unique provider message ID (for idempotency check)
            "raw_payload": dict      # Kept for reference or debugging
        }
        """
        pass

    @abstractmethod
    async def send_message(
        self,
        recipient_id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send a text message back to the customer on the channel.

        Args:
            recipient_id: Channel-specific recipient ID
            text: Markdown/plain text content to deliver
            metadata: Optional dictionary of attributes (e.g., attachment URLs)

        Returns:
            Dict containing delivery status and message transaction ID.
        """
        pass


class BaseDataIntegration(ABC):
    """
    Unified abstract interface for data sources.
    Exposes common actions like retrieving orders or syncing catalogs.
    """

    def __init__(self, integration_name: str):
        self.integration_name = integration_name
        self.log = logger.bind(integration_provider=integration_name)

    @abstractmethod
    async def get_order_by_id(self, order_id: str) -> Dict[str, Any]:
        """
        Fetch order details from the external API.

        Returns:
            Normalized dictionary following the CANONICAL_ORDER_FIELDS layout.
        """
        pass

    @abstractmethod
    async def sync_catalog(self, space_id: str) -> Dict[str, Any]:
        """
        Import catalog items and index them in the space's vector database.

        Returns:
            Dict with synchronization metadata (e.g., count, status).
        """
        pass

"""
app/integrations/stripe/client.py — Stripe Restricted REST API Client

This module implements a pure-HTTP client for Stripe's billing and refund APIs,
authenticating securely via Stripe Restricted API Keys.
"""

from typing import Dict, Any, Optional
import httpx
import structlog

logger = structlog.get_logger()


class StripeClient:
    """
    HTTP REST Client for Stripe APIs, using Restricted Keys.
    """

    def __init__(self, restricted_key: str):
        """
        Initialize the Stripe Client.

        Args:
            restricted_key: Stripe restricted API key (rk_live_***).
        """
        self.restricted_key = restricted_key
        self.base_url = "https://api.stripe.com/v1"
        
        # Stripe authenticates using standard Basic Auth (api_key as username, blank password)
        self.auth = (restricted_key, "")
        self.log = logger.bind()

    async def _request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute REST call to Stripe API.
        """
        url = f"{self.base_url}/{path.lstrip('/')}"
        self.log.info("Sending request to Stripe", method=method, path=path)

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    auth=self.auth,
                    data=data,
                    params=params
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                self.log.error(
                    "Stripe REST API returned error",
                    status_code=e.response.status_code,
                    response_text=e.response.text[:500]
                )
                raise Exception(f"Stripe API Error: {e.response.text[:200]}")
            except Exception as e:
                self.log.error("Failed to connect to Stripe REST API", error=str(e))
                raise e

    async def get_customer(self, customer_id: str) -> Dict[str, Any]:
        """
        Retrieve Stripe customer details.
        """
        self.log.info("Retrieving Stripe customer", customer_id=customer_id)
        return await self._request("GET", f"customers/{customer_id}")

    async def get_invoice(self, invoice_id: str) -> Dict[str, Any]:
        """
        Retrieve Stripe invoice details.
        """
        self.log.info("Retrieving Stripe invoice", invoice_id=invoice_id)
        return await self._request("GET", f"invoices/{invoice_id}")

    async def create_refund(self, charge_id: str, amount_cents: Optional[int] = None, reason: Optional[str] = None) -> Dict[str, Any]:
        """
        Issue a refund for a specific Stripe Charge or PaymentIntent.
        """
        self.log.info("Creating Stripe refund", charge_id=charge_id, amount=amount_cents)
        payload = {"charge": charge_id}
        if amount_cents:
            payload["amount"] = str(amount_cents)
        if reason:
            # Stripe refund reasons: duplicate, fraudulent, requested_by_customer
            payload["reason"] = "requested_by_customer"
            payload["metadata[reason_detail]"] = reason
            
        return await self._request("POST", "refunds", data=payload)

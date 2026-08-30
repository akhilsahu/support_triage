"""
app/integrations/shopify/client.py — Shopify API client wrapper

This module encapsulates all HTTP requests to the Shopify Admin REST API.
It handles authentication, request timeouts, rate limits, and structural logging.
"""

from typing import Dict, Any, List, Optional
import httpx
import structlog

logger = structlog.get_logger()


class ShopifyClient:
    """
    Shopify API client wrapper for admin resource requests.
    """

    def __init__(self, store_url: str, access_token: str, api_version: str = "2024-04"):
        """
        Initialize the Shopify Client.

        Args:
            store_url: The myshopify.com domain or custom store domain.
            access_token: The Admin API Access Token (shpat_***).
            api_version: Shopify API version (e.g., '2024-04').
        """
        # Ensure we have clean base URL (strip protocol/paths if provided by user)
        clean_url = store_url.replace("https://", "").replace("http://", "").split("/")[0]
        self.base_url = f"https://{clean_url}/admin/api/{api_version}"
        self.headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self.log = logger.bind(store_domain=clean_url)

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute an HTTP request to Shopify with timeout, rate limit handling, and logging.
        """
        url = f"{self.base_url}/{path.lstrip('/')}"
        self.log.info("Sending request to Shopify", method=method, path=path)

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=self.headers,
                    params=params,
                    json=json_data
                )
                
                # Check for rate-limiting (HTTP 429)
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After", "2")
                    self.log.error("Shopify API Rate Limited", retry_after=retry_after)
                    raise Exception(f"Shopify rate limited. Please retry after {retry_after}s.")

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                self.log.error(
                    "Shopify API returned error status",
                    status_code=e.response.status_code,
                    response_text=e.response.text[:500]
                )
                raise Exception(f"Shopify API Error: {e.response.text[:200]}")
            except Exception as e:
                self.log.error("Failed to connect to Shopify API", error=str(e))
                raise e

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """
        Fetch details of a single order.
        """
        self.log.info("Fetching order", order_id=order_id)
        return await self._request("GET", f"orders/{order_id}.json")

    async def get_products(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Fetch store products list (for catalog sync).
        """
        self.log.info("Fetching products list", limit=limit)
        response = await self._request("GET", "products.json", params={"limit": limit})
        return response.get("products", [])

    async def get_fulfillments(self, order_id: str) -> List[Dict[str, Any]]:
        """
        Fetch fulfillments for a given order (to resolve tracking numbers).
        """
        self.log.info("Fetching fulfillments for order", order_id=order_id)
        response = await self._request("GET", f"orders/{order_id}/fulfillments.json")
        return response.get("fulfillments", [])

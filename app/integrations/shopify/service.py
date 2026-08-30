"""
app/integrations/shopify/service.py — Shopify integration business logic

This module processes verified Shopify webhook payloads and performs sync operations.
"""

from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

logger = structlog.get_logger()


async def handle_shopify_order_update(payload: Dict[str, Any], db: AsyncSession) -> None:
    """
    Process order creation and update webhooks from Shopify.
    Maps fields to the canonical schema and triggers any required side-effects
    (e.g., updating database records, notifying agents, or logging CRM audit trails).
    """
    shopify_id = payload.get("id")
    order_number = payload.get("order_number") or payload.get("name")
    
    log = logger.bind(
        shopify_order_id=shopify_id,
        order_number=order_number,
        financial_status=payload.get("financial_status"),
        fulfillment_status=payload.get("fulfillment_status")
    )
    log.info("Processing Shopify order webhook payload")

    try:
        # Extract and normalize fields to the canonical schema format
        canonical_order = {
            "order_id": str(order_number),
            "status": map_shopify_status(payload),
            "placed_at": payload.get("created_at"),
            "customer_name": get_customer_name(payload),
            "item": get_items_summary(payload),
            "total": f"${payload.get('total_price', '0.00')}",
            "tracking": get_tracking_number(payload),
            "carrier": get_tracking_carrier(payload),
            "delivery_date": payload.get("estimated_status_delivery_date"),
            "address": get_shipping_address(payload),
            "last_location": None
        }
        
        log.info("Shopify order mapped to canonical schema", canonical_order=canonical_order)
        
        # Here we would persist the canonical order to a local caching database table,
        # update dynamic conversation variables, or check if the customer should be alert-escalated.
        # For now we write a structural trace and successfully complete the service task.
        
    except KeyError as e:
        log.error("Missing required field in Shopify payload", missing_field=str(e))
        raise
    except Exception as e:
        log.error("Failed to process Shopify order update", error=str(e))
        raise


def map_shopify_status(payload: Dict[str, Any]) -> str:
    """Map Shopify fulfillment and financial status to canonical statuses."""
    fulfillment = payload.get("fulfillment_status")
    if fulfillment == "fulfilled":
        return "Shipped"
    elif fulfillment == "restocked" or fulfillment == "partial":
        return "In Transit"
    
    financial = payload.get("financial_status")
    if financial == "refunded":
        return "Refunded"
    elif financial == "voided":
        return "Cancelled"
        
    return "Processing"


def get_customer_name(payload: Dict[str, Any]) -> str:
    """Safely extract customer name from payload."""
    customer = payload.get("customer") or {}
    first = customer.get("first_name") or ""
    last = customer.get("last_name") or ""
    name = f"{first} {last}".strip()
    return name or "Guest Customer"


def get_items_summary(payload: Dict[str, Any]) -> str:
    """Create a string summary of order line items."""
    items = payload.get("line_items") or []
    if not items:
        return "Unknown Item"
    if len(items) == 1:
        return items[0].get("title", "Unknown Item")
    return f"{items[0].get('title', 'Unknown Item')} (+{len(items) - 1} other items)"


def get_tracking_number(payload: Dict[str, Any]) -> Optional[str]:
    """Retrieve tracking number from fulfillment details."""
    fulfillments = payload.get("fulfillments") or []
    for f in fulfillments:
        tracking_numbers = f.get("tracking_numbers") or []
        if tracking_numbers:
            return tracking_numbers[0]
        tracking_number = f.get("tracking_number")
        if tracking_number:
            return tracking_number
    return None


def get_tracking_carrier(payload: Dict[str, Any]) -> Optional[str]:
    """Retrieve tracking carrier from fulfillment details."""
    fulfillments = payload.get("fulfillments") or []
    for f in fulfillments:
        tracking_company = f.get("tracking_company")
        if tracking_company:
            return tracking_company
    return None


def get_shipping_address(payload: Dict[str, Any]) -> Optional[str]:
    """Format shipping address as a single line."""
    address = payload.get("shipping_address") or {}
    if not address:
        return None
    addr1 = address.get("address1") or ""
    city = address.get("city") or ""
    province = address.get("province_code") or address.get("province") or ""
    zip_code = address.get("zip") or ""
    country = address.get("country_code") or address.get("country") or ""
    return f"{addr1}, {city} {province} {zip_code}, {country}".strip()

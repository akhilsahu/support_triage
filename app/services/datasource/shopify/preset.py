"""
Shopify Preset Builder — compiles Shopify tools into a reusable inward Data Source preset.
"""

from __future__ import annotations

from typing import Any, Dict
import structlog

logger = structlog.get_logger(__name__)


def get_shopify_preset() -> Dict[str, Any]:
    """
    Returns the complete Shopify Data Source preset configuration.
    """
    logger.info("Generating Shopify data source preset")

    tools = [
        {
            "name": "shopify_get_order",
            "display_name": "Get Shopify Order by ID",
            "description": "Fetch details of a specific Shopify order including total price and line items.",
            "method": "GET",
            "path": "/admin/api/2024-01/orders/{order_id}.json",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The unique numerical Shopify order ID"
                    }
                },
                "required": ["order_id"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {},
                "headers": {},
                "body": {}
            },
            "record_path": "order",
            "output_mapping": {
                "id": "order.id",
                "name": "order.name",
                "total_price": "order.total_price",
                "financial_status": "order.financial_status",
                "fulfillment_status": "order.fulfillment_status",
                "created_at": "order.created_at"
            }
        },
        {
            "name": "shopify_get_customer",
            "display_name": "Get Shopify Customer by ID",
            "description": "Retrieve customer profile, contact email, and total order count from Shopify.",
            "method": "GET",
            "path": "/admin/api/2024-01/customers/{customer_id}.json",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The unique numerical Shopify customer ID"
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
            "record_path": "customer",
            "output_mapping": {
                "id": "customer.id",
                "first_name": "customer.first_name",
                "last_name": "customer.last_name",
                "email": "customer.email",
                "orders_count": "customer.orders_count"
            }
        }
    ]

    return {
        "id": "shopify",
        "slug": "shopify",
        "name": "Shopify Store",
        "category": "E-Commerce",
        "description": "Sync live orders, customer profiles, and catalog metadata from your Shopify store.",
        "icon": "store",
        "api_version": "2024-01",
        "base_url_template": "https://{shop_url}",
        "auth_type": "api_key",
        "auth_header": "X-Shopify-Access-Token",
        "required_credentials": [
            {
                "name": "shop_url",
                "label": "Shopify Store Subdomain / URL",
                "type": "text",
                "placeholder": "mybrand.myshopify.com",
                "required": True,
                "help": "Your store's myshopify.com URL"
            },
            {
                "name": "access_token",
                "label": "Admin API Access Token",
                "type": "password",
                "placeholder": "shpat_xxxxxxxxxxxxxxxx",
                "required": True,
                "help": "Created in Shopify Settings > Apps > Develop apps"
            }
        ],
        "default_tool": tools[0],
        "tools": tools
    }

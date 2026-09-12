"""
WooCommerce Data Source Service & Preset — self-contained provider for WooCommerce REST API v3
including orders, products, and customers.
"""

from __future__ import annotations

from typing import Any, Dict, List
import structlog

logger = structlog.get_logger(__name__)


def get_woocommerce_tools() -> List[Dict[str, Any]]:
    """
    Returns all pre-configured WooCommerce REST API tools.
    """
    return [
        {
            "name": "wc_get_order_by_id",
            "display_name": "Get WooCommerce Order by ID",
            "description": "Fetch order details, payment status, total price, and tracking for a specific WooCommerce order.",
            "method": "GET",
            "path": "/wp-json/wc/v3/orders/{order_id}",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The unique numerical WooCommerce order ID"
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
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "number": "number",
                "status": "status",
                "total": "total",
                "currency": "currency",
                "date_created": "date_created",
                "customer_id": "customer_id",
                "billing_email": "billing.email",
                "shipping_city": "shipping.city"
            }
        },
        {
            "name": "wc_list_customer_orders",
            "display_name": "List WooCommerce Customer Orders",
            "description": "Search recent orders placed by a specific WooCommerce customer ID or email.",
            "method": "GET",
            "path": "/wp-json/wc/v3/orders",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The customer ID to filter orders by"
                    },
                    "search": {
                        "type": "string",
                        "description": "Search term (e.g. billing name or email)"
                    }
                },
                "required": [],
                "additionalProperties": False
            },
            "request_template": {
                "query": {
                    "customer": "{customer_id}",
                    "search": "{search}"
                },
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "number": "number",
                "status": "status",
                "total": "total",
                "date_created": "date_created"
            }
        },
        {
            "name": "wc_search_products",
            "display_name": "Search WooCommerce Products",
            "description": "Search product catalog by keywords, category, or title on WooCommerce.",
            "method": "GET",
            "path": "/wp-json/wc/v3/products",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Search query or product name"
                    }
                },
                "required": ["search"],
                "additionalProperties": False
            },
            "request_template": {
                "query": {
                    "search": "{search}"
                },
                "headers": {},
                "body": {}
            },
            "record_path": "",
            "output_mapping": {
                "id": "id",
                "name": "name",
                "price": "price",
                "regular_price": "regular_price",
                "stock_status": "stock_status",
                "stock_quantity": "stock_quantity",
                "permalink": "permalink"
            }
        },
        {
            "name": "wc_get_product_by_id",
            "display_name": "Get WooCommerce Product by ID",
            "description": "Retrieve full details, description, pricing, and specs for a specific WooCommerce product.",
            "method": "GET",
            "path": "/wp-json/wc/v3/products/{product_id}",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "product_id": {
                        "type": "string",
                        "description": "The unique numerical WooCommerce product ID"
                    }
                },
                "required": ["product_id"],
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
                "name": "name",
                "slug": "slug",
                "price": "price",
                "description": "description",
                "stock_status": "stock_status",
                "categories": "categories"
            }
        },
        {
            "name": "wc_get_customer_by_id",
            "display_name": "Get WooCommerce Customer Profile",
            "description": "Fetch customer contact info, billing address, and account details by customer ID.",
            "method": "GET",
            "path": "/wp-json/wc/v3/customers/{customer_id}",
            "risk_classification": "low",
            "input_schema": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The unique numerical customer ID"
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
                "first_name": "first_name",
                "last_name": "last_name",
                "email": "email",
                "billing": "billing",
                "shipping": "shipping"
            }
        }
    ]


def get_woocommerce_preset() -> Dict[str, Any]:
    """
    Returns the complete WooCommerce Data Source preset configuration.
    """
    logger.info("Generating WooCommerce data source preset")
    tools = get_woocommerce_tools()

    return {
        "id": "woocommerce",
        "slug": "woocommerce",
        "name": "WooCommerce Store",
        "category": "E-Commerce",
        "description": "Connect your WordPress WooCommerce store to look up customer orders, check inventory status, and search products.",
        "icon": "shopping-cart",
        "api_version": "v3",
        "base_url_template": "{site_url}",
        "auth_type": "basic",
        "auth_header": "Authorization",
        "required_credentials": [
            {
                "name": "site_url",
                "label": "WooCommerce Store Site URL",
                "type": "url",
                "placeholder": "https://mystore.com",
                "required": True,
                "help": "Your WooCommerce WordPress site address (e.g. https://mystore.com)"
            },
            {
                "name": "consumer_key",
                "label": "WooCommerce Consumer Key",
                "type": "text",
                "placeholder": "ck_xxxxxxxxxxxxxxxxxxxxxxxx",
                "required": True,
                "help": "Generated in WooCommerce > Settings > Advanced > REST API"
            },
            {
                "name": "consumer_secret",
                "label": "WooCommerce Consumer Secret",
                "type": "password",
                "placeholder": "cs_xxxxxxxxxxxxxxxxxxxxxxxx",
                "required": True,
                "help": "Generated alongside the Consumer Key"
            }
        ],
        "default_tool": tools[0],
        "tools": tools
    }

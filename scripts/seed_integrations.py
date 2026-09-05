import asyncio
import json
import uuid
import sys
from pathlib import Path

# Add the project root to sys.path so we can import app
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal
from app.models.integration_package import IntegrationPackage, IntegrationPackageTool
from sqlalchemy import select

PACKAGES = [
    {
        "slug": "shopify",
        "name": "Shopify",
        "description": "Connect your Shopify store to manage orders, products, and customers.",
        "icon_url": "https://cdn.shopify.com/static/shopify-favicon.png",
        "is_active": True,
        "connection_template": {
            "name": "Shopify",
            "type": "oauth2",
            "base_url_template": "https://{shop_url}/admin/api/2024-01",
            "auth_type": "bearer",
            "auth_header": "X-Shopify-Access-Token",
            "fields": [
                {"name": "shop_url", "type": "string", "label": "Shop URL", "required": True},
                {"name": "access_token", "type": "secret", "label": "Admin API Access Token", "required": True}
            ]
        }
    },
    {
        "slug": "whatsapp",
        "name": "WhatsApp",
        "description": "Connect WhatsApp Business API for customer communication.",
        "icon_url": "",
        "is_active": False,
        "connection_template": {}
    },
    {
        "slug": "slack",
        "name": "Slack",
        "description": "Send notifications and connect with team channels.",
        "icon_url": "",
        "is_active": False,
        "connection_template": {}
    },
    {
        "slug": "stripe",
        "name": "Stripe",
        "description": "Connect Stripe to view customer subscriptions and payments.",
        "icon_url": "",
        "is_active": False,
        "connection_template": {}
    },
    {
        "slug": "zendesk",
        "name": "Zendesk",
        "description": "Sync tickets and customer support data.",
        "icon_url": "",
        "is_active": False,
        "connection_template": {}
    },
    {
        "slug": "discord",
        "name": "Discord",
        "description": "Connect your community server for updates and moderation.",
        "icon_url": "",
        "is_active": False,
        "connection_template": {}
    },
    {
        "slug": "woocommerce",
        "name": "WooCommerce",
        "description": "Connect your WordPress WooCommerce store.",
        "icon_url": "",
        "is_active": False,
        "connection_template": {}
    },
    {
        "slug": "webhooks",
        "name": "Webhooks",
        "description": "Send outgoing webhooks to any custom endpoint.",
        "icon_url": "",
        "is_active": False,
        "connection_template": {}
    }
]


async def seed_integrations():
    async with AsyncSessionLocal() as db:
        for p in PACKAGES:
            result = await db.execute(select(IntegrationPackage).where(IntegrationPackage.slug == p["slug"]))
            package = result.scalar_one_or_none()
            
            if not package:
                package = IntegrationPackage(
                    id=uuid.uuid4(),
                    slug=p["slug"],
                    name=p["name"],
                    description=p["description"],
                    icon_url=p["icon_url"],
                    is_active=p["is_active"],
                    connection_template=p.get("connection_template", {})
                )
                db.add(package)
                await db.commit()
                print(f"Created package: {package.name}")
            else:
                # Update connection template
                package.connection_template = p.get("connection_template", {})
                await db.commit()
                print(f"Package already exists: {package.name}, updated template.")
                
            if p["slug"] == "shopify":
                # Tools for Shopify
                tools = [
                    {
                        "name": "get_order",
                        "display_name": "Get Order",
                        "description": "Fetch details of a specific order by ID.",
                        "method": "GET",
                        "path": "/admin/api/2024-01/orders/{{order_id}}.json",
                        "risk_classification": "low",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "order_id": {"type": "string"}
                            },
                            "required": ["order_id"]
                        },
                        "request_template": {
                            "headers": {
                                "X-Shopify-Access-Token": "{{connection.access_token}}"
                            },
                            "url": "https://{{connection.shop_url}}{{path}}"
                        },
                        "output_mapping": {
                            "id": "order.id",
                            "name": "order.name",
                            "total_price": "order.total_price",
                            "status": "order.financial_status"
                        },
                        "record_path": "order",
                        "max_records": 1
                    },
                    {
                        "name": "get_customer",
                        "display_name": "Get Customer",
                        "description": "Fetch details of a specific customer by ID.",
                        "method": "GET",
                        "path": "/admin/api/2024-01/customers/{{customer_id}}.json",
                        "risk_classification": "low",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "customer_id": {"type": "string"}
                            },
                            "required": ["customer_id"]
                        },
                        "request_template": {
                            "headers": {
                                "X-Shopify-Access-Token": "{{connection.access_token}}"
                            },
                            "url": "https://{{connection.shop_url}}{{path}}"
                        },
                        "output_mapping": {
                            "id": "customer.id",
                            "first_name": "customer.first_name",
                            "last_name": "customer.last_name",
                            "email": "customer.email"
                        },
                        "record_path": "customer",
                        "max_records": 1
                    }
                ]

                for t in tools:
                    result = await db.execute(select(IntegrationPackageTool).where(
                        IntegrationPackageTool.package_id == package.id,
                        IntegrationPackageTool.name == t['name']
                    ))
                    tool = result.scalar_one_or_none()
                    if not tool:
                        tool = IntegrationPackageTool(
                            id=uuid.uuid4(),
                            package_id=package.id,
                            **t
                        )
                        db.add(tool)
                        print(f"Created tool: {tool.name}")
                
        await db.commit()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(seed_integrations())

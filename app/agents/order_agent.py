"""
Order Agent — handles product browsing, order placement, and replacements.

Responsibilities:
1. Browse and search product catalog
2. Place new orders (validates stock, deducts wallet)
3. Initiate replacement orders via LogisticsAgent
4. Log every action to CRM audit trail
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from uuid import uuid4
import structlog

from app.mock.products import MOCK_PRODUCTS, search_products, get_product
from app.services.crm_service import (
    ActionEnforcementService,
    ActionType,
    TicketStatus,
    get_action_enforcement_service,
)

logger = structlog.get_logger()


class OrderAgent:
    """Handles product browsing and order placement."""

    def __init__(self, action_enforcement: Optional[ActionEnforcementService] = None):
        self.action_enforcement = action_enforcement or get_action_enforcement_service()
        self.orders_placed = 0
        self._mcp_server = None   # injected by chat handler when org has data sources

    def set_mcp_server(self, server) -> None:
        """Inject the loaded DataSourceMCPServer for this org's session."""
        self._mcp_server = server

    async def lookup_order(self, ticket_id: str, order_id: str) -> Dict[str, Any]:
        """
        Look up a specific order via the org's configured data source (MCP).
        Falls back to a not-found response if no data source is configured.
        """
        if not self._mcp_server:
            return {"error": "No data source configured for order lookup."}

        result = await self._mcp_server.call_tool("get_order", {"id": order_id})

        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.TRIAGE_COMPLETE,
            agent_id="order-001",
            agent_type="order",
            details={"action": "lookup_order", "order_id": order_id, "found": result.get("count", 0) > 0},
            status=TicketStatus.IN_PROGRESS,
        )

        logger.info("Order lookup via MCP", order_id=order_id, result_count=result.get("count", 0))
        return result

    async def browse_products(
        self,
        ticket_id: str,
        query: str = "",
        category: str = "",
    ) -> Dict[str, Any]:
        """
        Search and list available products.
        Returns matching products with stock and pricing.
        """
        results = search_products(query=query, category=category)

        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.TRIAGE_COMPLETE,
            agent_id="order-001",
            agent_type="order",
            details={"action": "browse_products", "query": query, "category": category, "results": len(results)},
            status=TicketStatus.IN_PROGRESS,
        )

        logger.info("Products browsed", query=query, category=category, count=len(results))
        return {"products": results, "total": len(results), "query": query, "category": category}

    async def place_order(
        self,
        ticket_id: str,
        customer_name: str,
        product_id: str,
        quantity: int = 1,
        use_wallet_credits: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Place a new order for a product.
        Validates stock, calculates totals, and logs to CRM.
        """
        product = get_product(product_id)
        if not product:
            return {"success": False, "error": f"Product {product_id} not found."}

        if product["stock"] < quantity:
            return {
                "success": False,
                "error": f"Only {product['stock']} units of '{product['name']}' in stock.",
            }

        subtotal = round(product["price"] * quantity, 2)
        discount = min(use_wallet_credits, subtotal)
        total_charged = round(subtotal - discount, 2)

        order_id = f"ORD-{str(uuid4())[:4].upper()}"
        estimated_delivery = (datetime.utcnow() + timedelta(days=4)).strftime("%B %d, %Y")

        # Deduct stock in mock data
        MOCK_PRODUCTS[product_id]["stock"] -= quantity

        self.orders_placed += 1

        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.FINANCE_ACTION,
            agent_id="order-001",
            agent_type="order",
            details={
                "action": "order_placed",
                "order_id": order_id,
                "product_id": product_id,
                "product_name": product["name"],
                "quantity": quantity,
                "subtotal": subtotal,
                "wallet_credits_used": discount,
                "total_charged": total_charged,
                "customer": customer_name,
            },
            status=TicketStatus.RESOLVED,
        )

        logger.info("Order placed", order_id=order_id, product=product["name"], total=total_charged)

        return {
            "success": True,
            "order_id": order_id,
            "product": product["name"],
            "quantity": quantity,
            "subtotal": subtotal,
            "wallet_credits_used": discount,
            "total_charged": total_charged,
            "estimated_delivery": estimated_delivery,
            "status": "Confirmed",
        }

    async def request_replacement(
        self,
        ticket_id: str,
        order_id: str,
        reason: str,
        customer_name: str,
    ) -> Dict[str, Any]:
        """
        Initiate a replacement for a delivered order.
        Delegates tracking/logistics action to LogisticsAgent.
        """
        from app.agents.logistics_agent import get_logistics_agent

        logistics = get_logistics_agent()
        decision = await logistics.create_replacement_order(
            ticket_id=ticket_id,
            order_id=order_id,
            reason=reason,
        )

        logger.info("Replacement requested", order_id=order_id, reason=reason)
        return {
            "success": decision.result == "success",
            "replacement_order_id": decision.details.get("replacement_order_id"),
            "original_order_id": order_id,
            "reason": reason,
            "status": "Replacement initiated" if decision.result == "success" else "Failed",
            "details": decision.details,
        }

    def get_statistics(self) -> Dict[str, Any]:
        return {"orders_placed": self.orders_placed}


# Global instance
_order_agent: Optional[OrderAgent] = None


def get_order_agent() -> OrderAgent:
    global _order_agent
    if _order_agent is None:
        _order_agent = OrderAgent()
    return _order_agent

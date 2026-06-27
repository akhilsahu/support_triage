"""
Logistics Agent with Mock API Integrations

This module implements the Logistics Agent that handles shipping, delivery,
and inventory-related issues using mock shipping and inventory APIs.

Key Features:
- Order tracking via shipping API
- Address updates
- Inventory availability checks
- Replacement order creation
- API call logging
- Mandatory CRM updates
"""

from typing import Dict, Any, Optional, List
from enum import Enum
from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel, Field

from app.services.shipping_api import (
    MockShippingAPI,
    TrackingResponse,
    AddressUpdateResponse,
    ReplacementOrderResponse,
    get_shipping_api
)
from app.services.inventory_api import (
    MockInventoryAPI,
    StockResponse,
    ReservationResponse,
    get_inventory_api
)
from app.services.crm_service import (
    CRMService,
    ActionEnforcementService,
    ActionType,
    TicketStatus,
    get_crm_service,
    get_action_enforcement_service
)


class LogisticsActionType(str, Enum):
    """Logistics action types"""
    TRACKED = "tracked"
    ADDRESS_UPDATED = "address_updated"
    REPLACEMENT_INITIATED = "replacement_initiated"
    INVENTORY_CHECKED = "inventory_checked"
    STOCK_RESERVED = "stock_reserved"


class APICallLog(BaseModel):
    """API call log entry"""
    endpoint: str
    method: str
    status: int
    response_time_ms: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class LogisticsDecision(BaseModel):
    """Logistics decision result"""
    ticket_id: str
    order_id: Optional[str] = None
    action_type: LogisticsActionType
    api_calls: List[APICallLog] = Field(default_factory=list)
    result: str  # success, partial, failed
    details: Dict[str, Any] = Field(default_factory=dict)
    customer_notified: bool = False
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class LogisticsAgent:
    """
    Logistics Agent - Handles shipping, delivery, and inventory issues.
    
    Responsibilities:
    1. Track orders via shipping API
    2. Update delivery addresses
    3. Check inventory availability
    4. Create replacement orders
    5. Log all API interactions
    6. Update CRM with logistics actions
    """
    
    def __init__(
        self,
        shipping_api: Optional[MockShippingAPI] = None,
        inventory_api: Optional[MockInventoryAPI] = None,
        crm_service: Optional[CRMService] = None,
        action_enforcement: Optional[ActionEnforcementService] = None
    ):
        """
        Initialize the Logistics Agent.
        
        Args:
            shipping_api: Shipping API instance
            inventory_api: Inventory API instance
            crm_service: CRM service instance
            action_enforcement: Action enforcement service instance
        """
        self.shipping_api = shipping_api or get_shipping_api()
        self.inventory_api = inventory_api or get_inventory_api()
        self.crm_service = crm_service or get_crm_service()
        self.action_enforcement = action_enforcement or get_action_enforcement_service()
        
        self.actions_count = 0
        self.api_calls_count = 0
    
    async def track_order(
        self,
        ticket_id: str,
        tracking_number: str
    ) -> LogisticsDecision:
        """
        Track an order using shipping API.
        
        Args:
            ticket_id: Ticket identifier
            tracking_number: Tracking number to look up
            
        Returns:
            LogisticsDecision with tracking details
        """
        self.actions_count += 1
        self.api_calls_count += 1
        
        api_calls = []
        start_time = datetime.utcnow()
        
        try:
            # Query shipping API
            tracking_response = await self.shipping_api.track_shipment(tracking_number)
            
            # Log API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint=f"/api/shipping/track/{tracking_number}",
                method="GET",
                status=200,
                response_time_ms=response_time
            ))
            
            # Extract details
            details = {
                "tracking_number": tracking_response.tracking_number,
                "order_id": tracking_response.order_id,
                "status": tracking_response.status.value,
                "carrier": tracking_response.carrier.value,
                "current_location": tracking_response.current_location,
                "estimated_delivery": tracking_response.estimated_delivery,
                "actual_delivery": tracking_response.actual_delivery
            }
            
            # Update CRM
            await self.action_enforcement.log_action(
                ticket_id=ticket_id,
                action_type=ActionType.LOGISTICS_ACTION,
                agent_id="logistics-001",
                agent_type="logistics",
                details={
                    "action": "tracked",
                    "tracking_number": tracking_number,
                    "status": tracking_response.status.value,
                    "estimated_delivery": tracking_response.estimated_delivery
                },
                status=TicketStatus.IN_PROGRESS
            )
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                order_id=tracking_response.order_id,
                action_type=LogisticsActionType.TRACKED,
                api_calls=api_calls,
                result="success",
                details=details,
                customer_notified=True
            )
            
        except Exception as e:
            # Log failed API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint=f"/api/shipping/track/{tracking_number}",
                method="GET",
                status=500,
                response_time_ms=response_time
            ))
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                action_type=LogisticsActionType.TRACKED,
                api_calls=api_calls,
                result="failed",
                details={"error": str(e)},
                customer_notified=False
            )
    
    async def update_delivery_address(
        self,
        ticket_id: str,
        order_id: str,
        new_address: Dict[str, str]
    ) -> LogisticsDecision:
        """
        Update delivery address for an order.
        
        Args:
            ticket_id: Ticket identifier
            order_id: Order identifier
            new_address: New shipping address
            
        Returns:
            LogisticsDecision with update status
        """
        self.actions_count += 1
        self.api_calls_count += 1
        
        api_calls = []
        start_time = datetime.utcnow()
        
        try:
            # Call shipping API to update address
            update_response = await self.shipping_api.update_address(
                order_id=order_id,
                new_address=new_address
            )
            
            # Log API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint="/api/shipping/update-address",
                method="POST",
                status=200,
                response_time_ms=response_time
            ))
            
            # Extract details
            details = {
                "order_id": update_response.order_id,
                "new_address": update_response.new_address,
                "new_delivery_date": update_response.new_delivery_date,
                "message": update_response.message
            }
            
            # Update CRM
            await self.action_enforcement.log_action(
                ticket_id=ticket_id,
                action_type=ActionType.LOGISTICS_ACTION,
                agent_id="logistics-001",
                agent_type="logistics",
                details={
                    "action": "address_updated",
                    "order_id": order_id,
                    "new_delivery_date": update_response.new_delivery_date
                },
                status=TicketStatus.IN_PROGRESS
            )
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                order_id=order_id,
                action_type=LogisticsActionType.ADDRESS_UPDATED,
                api_calls=api_calls,
                result="success",
                details=details,
                customer_notified=True
            )
            
        except Exception as e:
            # Log failed API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint="/api/shipping/update-address",
                method="POST",
                status=500,
                response_time_ms=response_time
            ))
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                order_id=order_id,
                action_type=LogisticsActionType.ADDRESS_UPDATED,
                api_calls=api_calls,
                result="failed",
                details={"error": str(e)},
                customer_notified=False
            )
    
    async def create_replacement_order(
        self,
        ticket_id: str,
        original_order_id: str,
        reason: str,
        expedite: bool = True
    ) -> LogisticsDecision:
        """
        Create a replacement order.
        
        Args:
            ticket_id: Ticket identifier
            original_order_id: Original order identifier
            reason: Reason for replacement
            expedite: Whether to expedite shipping
            
        Returns:
            LogisticsDecision with replacement order details
        """
        self.actions_count += 1
        self.api_calls_count += 1
        
        api_calls = []
        start_time = datetime.utcnow()
        
        try:
            # Call shipping API to create replacement
            replacement_response = await self.shipping_api.create_replacement_order(
                original_order_id=original_order_id,
                reason=reason,
                expedite=expedite
            )
            
            # Log API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint="/api/shipping/create-replacement",
                method="POST",
                status=200,
                response_time_ms=response_time
            ))
            
            # Extract details
            details = {
                "original_order_id": replacement_response.original_order_id,
                "replacement_order_id": replacement_response.replacement_order_id,
                "tracking_number": replacement_response.tracking_number,
                "estimated_delivery": replacement_response.estimated_delivery,
                "expedited": replacement_response.expedited,
                "message": replacement_response.message
            }
            
            # Update CRM
            await self.action_enforcement.log_action(
                ticket_id=ticket_id,
                action_type=ActionType.LOGISTICS_ACTION,
                agent_id="logistics-001",
                agent_type="logistics",
                details={
                    "action": "replacement_initiated",
                    "original_order_id": original_order_id,
                    "replacement_order_id": replacement_response.replacement_order_id,
                    "tracking_number": replacement_response.tracking_number,
                    "estimated_delivery": replacement_response.estimated_delivery
                },
                status=TicketStatus.IN_PROGRESS
            )
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                order_id=replacement_response.replacement_order_id,
                action_type=LogisticsActionType.REPLACEMENT_INITIATED,
                api_calls=api_calls,
                result="success",
                details=details,
                customer_notified=True
            )
            
        except Exception as e:
            # Log failed API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint="/api/shipping/create-replacement",
                method="POST",
                status=500,
                response_time_ms=response_time
            ))
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                order_id=original_order_id,
                action_type=LogisticsActionType.REPLACEMENT_INITIATED,
                api_calls=api_calls,
                result="failed",
                details={"error": str(e)},
                customer_notified=False
            )
    
    async def check_inventory(
        self,
        ticket_id: str,
        product_id: str
    ) -> LogisticsDecision:
        """
        Check inventory availability.
        
        Args:
            ticket_id: Ticket identifier
            product_id: Product identifier
            
        Returns:
            LogisticsDecision with inventory details
        """
        self.actions_count += 1
        self.api_calls_count += 1
        
        api_calls = []
        start_time = datetime.utcnow()
        
        try:
            # Query inventory API
            stock_response = await self.inventory_api.check_stock(product_id)
            
            # Log API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint=f"/api/inventory/check/{product_id}",
                method="GET",
                status=200,
                response_time_ms=response_time
            ))
            
            # Extract details
            details = {
                "product_id": stock_response.product_id,
                "product_name": stock_response.product_name,
                "in_stock": stock_response.in_stock,
                "quantity": stock_response.quantity,
                "status": stock_response.status.value,
                "warehouse": stock_response.warehouse.value,
                "price": stock_response.price,
                "next_restock": stock_response.next_restock,
                "alternatives": stock_response.alternatives
            }
            
            # Update CRM
            await self.action_enforcement.log_action(
                ticket_id=ticket_id,
                action_type=ActionType.LOGISTICS_ACTION,
                agent_id="logistics-001",
                agent_type="logistics",
                details={
                    "action": "inventory_checked",
                    "product_id": product_id,
                    "in_stock": stock_response.in_stock,
                    "quantity": stock_response.quantity
                },
                status=TicketStatus.IN_PROGRESS
            )
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                action_type=LogisticsActionType.INVENTORY_CHECKED,
                api_calls=api_calls,
                result="success",
                details=details,
                customer_notified=True
            )
            
        except Exception as e:
            # Log failed API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint=f"/api/inventory/check/{product_id}",
                method="GET",
                status=500,
                response_time_ms=response_time
            ))
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                action_type=LogisticsActionType.INVENTORY_CHECKED,
                api_calls=api_calls,
                result="failed",
                details={"error": str(e)},
                customer_notified=False
            )
    
    async def reserve_inventory(
        self,
        ticket_id: str,
        product_id: str,
        quantity: int,
        order_id: str
    ) -> LogisticsDecision:
        """
        Reserve inventory for an order.
        
        Args:
            ticket_id: Ticket identifier
            product_id: Product identifier
            quantity: Quantity to reserve
            order_id: Order identifier
            
        Returns:
            LogisticsDecision with reservation details
        """
        self.actions_count += 1
        self.api_calls_count += 1
        
        api_calls = []
        start_time = datetime.utcnow()
        
        try:
            # Call inventory API to reserve stock
            reservation_response = await self.inventory_api.reserve_stock(
                product_id=product_id,
                quantity=quantity,
                order_id=order_id
            )
            
            # Log API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint=f"/api/inventory/reserve/{product_id}",
                method="POST",
                status=200,
                response_time_ms=response_time
            ))
            
            # Extract details
            details = {
                "reservation_id": reservation_response.reservation_id,
                "product_id": reservation_response.product_id,
                "quantity": reservation_response.quantity,
                "order_id": reservation_response.order_id,
                "warehouse": reservation_response.warehouse.value,
                "expires_at": reservation_response.expires_at.isoformat(),
                "message": reservation_response.message
            }
            
            # Update CRM
            await self.action_enforcement.log_action(
                ticket_id=ticket_id,
                action_type=ActionType.LOGISTICS_ACTION,
                agent_id="logistics-001",
                agent_type="logistics",
                details={
                    "action": "stock_reserved",
                    "product_id": product_id,
                    "quantity": quantity,
                    "reservation_id": reservation_response.reservation_id
                },
                status=TicketStatus.IN_PROGRESS
            )
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                order_id=order_id,
                action_type=LogisticsActionType.STOCK_RESERVED,
                api_calls=api_calls,
                result="success",
                details=details,
                customer_notified=True
            )
            
        except Exception as e:
            # Log failed API call
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            api_calls.append(APICallLog(
                endpoint=f"/api/inventory/reserve/{product_id}",
                method="POST",
                status=500,
                response_time_ms=response_time
            ))
            
            return LogisticsDecision(
                ticket_id=ticket_id,
                order_id=order_id,
                action_type=LogisticsActionType.STOCK_RESERVED,
                api_calls=api_calls,
                result="failed",
                details={"error": str(e)},
                customer_notified=False
            )
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get logistics agent statistics.
        
        Returns:
            Dictionary with statistics
        """
        return {
            "total_actions": self.actions_count,
            "total_api_calls": self.api_calls_count,
            "shipping_api_stats": self.shipping_api.get_statistics(),
            "inventory_api_stats": self.inventory_api.get_statistics()
        }


# Global logistics agent instance
_logistics_agent: Optional[LogisticsAgent] = None


def get_logistics_agent() -> LogisticsAgent:
    """
    Get the global logistics agent instance.
    
    Returns:
        The logistics agent
    """
    global _logistics_agent
    if _logistics_agent is None:
        _logistics_agent = LogisticsAgent()
    return _logistics_agent

# Made with Bob

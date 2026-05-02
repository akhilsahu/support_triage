"""
Mock Shipping API Service

This module provides a mock shipping API for the Logistics Agent.
Simulates real shipping carrier APIs with realistic responses.

Key Features:
- Order tracking
- Address updates
- Replacement order creation
- Realistic response delays
- Error simulation
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from enum import Enum
import asyncio
from uuid import uuid4
from random import random, choice

from pydantic import BaseModel, Field


class ShipmentStatus(str, Enum):
    """Shipment status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    IN_TRANSIT = "in_transit"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    DELAYED = "delayed"
    LOST = "lost"
    RETURNED = "returned"


class Carrier(str, Enum):
    """Shipping carrier enumeration"""
    FEDEX = "FedEx"
    UPS = "UPS"
    USPS = "USPS"
    DHL = "DHL"


class TrackingResponse(BaseModel):
    """Tracking API response"""
    tracking_number: str
    order_id: str
    status: ShipmentStatus
    carrier: Carrier
    current_location: str
    estimated_delivery: str
    actual_delivery: Optional[str] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class AddressUpdateResponse(BaseModel):
    """Address update API response"""
    success: bool
    order_id: str
    new_address: Dict[str, str]
    new_delivery_date: str
    message: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ReplacementOrderResponse(BaseModel):
    """Replacement order API response"""
    success: bool
    original_order_id: str
    replacement_order_id: str
    tracking_number: str
    estimated_delivery: str
    expedited: bool
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MockShippingAPI:
    """
    Mock Shipping API service.
    
    Simulates a real shipping carrier API with realistic responses,
    delays, and occasional errors for testing.
    """
    
    def __init__(self):
        """Initialize the mock shipping API"""
        # Mock database of shipments
        self._shipments: Dict[str, Dict[str, Any]] = {}
        self._initialize_mock_data()
        
        # API call statistics
        self.api_calls = 0
        self.successful_calls = 0
        self.failed_calls = 0
    
    def _initialize_mock_data(self):
        """Initialize some mock shipment data"""
        # Create a few sample shipments
        sample_shipments = [
            {
                "tracking_number": "TRK123456789",
                "order_id": "ORD-67890",
                "status": ShipmentStatus.IN_TRANSIT,
                "carrier": Carrier.FEDEX,
                "current_location": "Distribution Center - Chicago, IL",
                "estimated_delivery": (datetime.utcnow() + timedelta(days=2)).strftime("%Y-%m-%d")
            },
            {
                "tracking_number": "TRK987654321",
                "order_id": "ORD-12345",
                "status": ShipmentStatus.DELIVERED,
                "carrier": Carrier.UPS,
                "current_location": "Delivered - Front Door",
                "estimated_delivery": (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d"),
                "actual_delivery": (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
            },
            {
                "tracking_number": "TRK555666777",
                "order_id": "ORD-54321",
                "status": ShipmentStatus.DELAYED,
                "carrier": Carrier.USPS,
                "current_location": "Sorting Facility - Memphis, TN",
                "estimated_delivery": (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d")
            }
        ]
        
        for shipment in sample_shipments:
            self._shipments[shipment["tracking_number"]] = shipment
    
    async def track_shipment(
        self,
        tracking_number: str
    ) -> TrackingResponse:
        """
        Track a shipment by tracking number.
        
        Args:
            tracking_number: The tracking number to look up
            
        Returns:
            TrackingResponse with shipment details
            
        Raises:
            ValueError: If tracking number not found
        """
        self.api_calls += 1
        
        # Simulate API delay
        await asyncio.sleep(random() * 0.3)  # 0-300ms delay
        
        # Simulate occasional API errors (5% chance)
        if random() < 0.05:
            self.failed_calls += 1
            raise ValueError(f"API Error: Unable to connect to carrier system")
        
        # Look up shipment
        if tracking_number not in self._shipments:
            self.failed_calls += 1
            raise ValueError(f"Tracking number {tracking_number} not found")
        
        shipment = self._shipments[tracking_number]
        self.successful_calls += 1
        
        # Generate tracking history
        history = self._generate_tracking_history(shipment)
        
        return TrackingResponse(
            tracking_number=tracking_number,
            order_id=shipment["order_id"],
            status=shipment["status"],
            carrier=shipment["carrier"],
            current_location=shipment["current_location"],
            estimated_delivery=shipment["estimated_delivery"],
            actual_delivery=shipment.get("actual_delivery"),
            history=history
        )
    
    async def update_address(
        self,
        order_id: str,
        new_address: Dict[str, str]
    ) -> AddressUpdateResponse:
        """
        Update shipping address for an order.
        
        Args:
            order_id: The order identifier
            new_address: New shipping address
            
        Returns:
            AddressUpdateResponse with update status
            
        Raises:
            ValueError: If order not found or already shipped
        """
        self.api_calls += 1
        
        # Simulate API delay
        await asyncio.sleep(random() * 0.2)
        
        # Find shipment by order_id
        shipment = None
        tracking_number = None
        for tn, ship in self._shipments.items():
            if ship["order_id"] == order_id:
                shipment = ship
                tracking_number = tn
                break
        
        if not shipment:
            self.failed_calls += 1
            raise ValueError(f"Order {order_id} not found")
        
        # Check if order can be modified
        if shipment["status"] in [ShipmentStatus.SHIPPED, ShipmentStatus.IN_TRANSIT, 
                                   ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED]:
            self.failed_calls += 1
            raise ValueError(
                f"Cannot update address - order already {shipment['status'].value}"
            )
        
        # Update address (in real system, would update database)
        # For mock, we just return success
        
        # Calculate new delivery date (add 1 day for address change)
        original_date = datetime.strptime(shipment["estimated_delivery"], "%Y-%m-%d")
        new_date = original_date + timedelta(days=1)
        
        self.successful_calls += 1
        
        return AddressUpdateResponse(
            success=True,
            order_id=order_id,
            new_address=new_address,
            new_delivery_date=new_date.strftime("%Y-%m-%d"),
            message="Address updated successfully. Delivery date adjusted by 1 day."
        )
    
    async def create_replacement_order(
        self,
        original_order_id: str,
        reason: str,
        expedite: bool = True
    ) -> ReplacementOrderResponse:
        """
        Create a replacement order.
        
        Args:
            original_order_id: Original order identifier
            reason: Reason for replacement
            expedite: Whether to expedite shipping
            
        Returns:
            ReplacementOrderResponse with new order details
        """
        self.api_calls += 1
        
        # Simulate API delay
        await asyncio.sleep(random() * 0.4)
        
        # Generate new order and tracking number
        replacement_order_id = f"ORD-{uuid4().hex[:8].upper()}"
        tracking_number = f"TRK{uuid4().hex[:9].upper()}"
        
        # Calculate delivery date (expedited = 2 days, standard = 5 days)
        days_to_delivery = 2 if expedite else 5
        estimated_delivery = (datetime.utcnow() + timedelta(days=days_to_delivery)).strftime("%Y-%m-%d")
        
        # Create shipment record
        self._shipments[tracking_number] = {
            "tracking_number": tracking_number,
            "order_id": replacement_order_id,
            "status": ShipmentStatus.PROCESSING,
            "carrier": Carrier.FEDEX if expedite else choice(list(Carrier)),
            "current_location": "Warehouse - Processing",
            "estimated_delivery": estimated_delivery,
            "original_order_id": original_order_id,
            "reason": reason
        }
        
        self.successful_calls += 1
        
        return ReplacementOrderResponse(
            success=True,
            original_order_id=original_order_id,
            replacement_order_id=replacement_order_id,
            tracking_number=tracking_number,
            estimated_delivery=estimated_delivery,
            expedited=expedite,
            message=f"Replacement order created successfully. {'Expedited' if expedite else 'Standard'} shipping."
        )
    
    def _generate_tracking_history(
        self,
        shipment: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Generate realistic tracking history.
        
        Args:
            shipment: Shipment data
            
        Returns:
            List of tracking events
        """
        status = shipment["status"]
        carrier = shipment["carrier"]
        
        # Base history that all shipments have
        history = [
            {
                "timestamp": (datetime.utcnow() - timedelta(days=3)).isoformat(),
                "location": "Warehouse - San Francisco, CA",
                "status": "Order Received",
                "description": "Shipment information received"
            },
            {
                "timestamp": (datetime.utcnow() - timedelta(days=2, hours=12)).isoformat(),
                "location": "Warehouse - San Francisco, CA",
                "status": "Processing",
                "description": "Package is being prepared for shipment"
            }
        ]
        
        # Add status-specific history
        if status in [ShipmentStatus.SHIPPED, ShipmentStatus.IN_TRANSIT, 
                      ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED]:
            history.append({
                "timestamp": (datetime.utcnow() - timedelta(days=2)).isoformat(),
                "location": "Warehouse - San Francisco, CA",
                "status": "Shipped",
                "description": f"Package picked up by {carrier.value}"
            })
        
        if status in [ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, 
                      ShipmentStatus.DELIVERED]:
            history.append({
                "timestamp": (datetime.utcnow() - timedelta(days=1)).isoformat(),
                "location": shipment["current_location"],
                "status": "In Transit",
                "description": "Package in transit to destination"
            })
        
        if status == ShipmentStatus.OUT_FOR_DELIVERY:
            history.append({
                "timestamp": datetime.utcnow().isoformat(),
                "location": "Local Facility",
                "status": "Out for Delivery",
                "description": "Package is out for delivery"
            })
        
        if status == ShipmentStatus.DELIVERED:
            history.append({
                "timestamp": shipment.get("actual_delivery", datetime.utcnow().isoformat()),
                "location": "Delivered",
                "status": "Delivered",
                "description": "Package delivered successfully"
            })
        
        if status == ShipmentStatus.DELAYED:
            history.append({
                "timestamp": (datetime.utcnow() - timedelta(hours=6)).isoformat(),
                "location": shipment["current_location"],
                "status": "Delayed",
                "description": "Package delayed due to weather conditions"
            })
        
        return history
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get API statistics.
        
        Returns:
            Dictionary with statistics
        """
        success_rate = 0.0
        if self.api_calls > 0:
            success_rate = self.successful_calls / self.api_calls
        
        return {
            "total_api_calls": self.api_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "success_rate": round(success_rate, 3),
            "total_shipments": len(self._shipments)
        }


# Global shipping API instance
_shipping_api: Optional[MockShippingAPI] = None


def get_shipping_api() -> MockShippingAPI:
    """
    Get the global shipping API instance.
    
    Returns:
        The shipping API
    """
    global _shipping_api
    if _shipping_api is None:
        _shipping_api = MockShippingAPI()
    return _shipping_api

# Made with Bob

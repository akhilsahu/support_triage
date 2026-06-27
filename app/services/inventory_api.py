"""
Mock Inventory API Service

This module provides a mock inventory API for the Logistics Agent.
Simulates real inventory management systems with stock checks and reservations.

Key Features:
- Stock availability checks
- Inventory reservations
- Warehouse location tracking
- Restock date predictions
- Alternative product suggestions
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from enum import Enum
import asyncio
from uuid import uuid4
from random import random, randint, choice

from pydantic import BaseModel, Field


class StockStatus(str, Enum):
    """Stock status enumeration"""
    IN_STOCK = "in_stock"
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"
    DISCONTINUED = "discontinued"
    BACKORDERED = "backordered"


class Warehouse(str, Enum):
    """Warehouse location enumeration"""
    WAREHOUSE_A = "Warehouse A - San Francisco, CA"
    WAREHOUSE_B = "Warehouse B - Chicago, IL"
    WAREHOUSE_C = "Warehouse C - New York, NY"
    WAREHOUSE_D = "Warehouse D - Dallas, TX"


class StockResponse(BaseModel):
    """Stock check API response"""
    product_id: str
    product_name: str
    in_stock: bool
    quantity: int
    status: StockStatus
    warehouse: Warehouse
    price: float
    next_restock: Optional[str] = None
    alternatives: List[Dict[str, Any]] = Field(default_factory=list)
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class ReservationResponse(BaseModel):
    """Inventory reservation API response"""
    success: bool
    reservation_id: str
    product_id: str
    quantity: int
    order_id: str
    warehouse: Warehouse
    expires_at: datetime
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MockInventoryAPI:
    """
    Mock Inventory API service.
    
    Simulates a real inventory management system with stock tracking,
    reservations, and warehouse management.
    """
    
    def __init__(self):
        """Initialize the mock inventory API"""
        # Mock database of products
        self._products: Dict[str, Dict[str, Any]] = {}
        self._reservations: Dict[str, Dict[str, Any]] = {}
        self._initialize_mock_data()
        
        # API call statistics
        self.api_calls = 0
        self.successful_calls = 0
        self.failed_calls = 0
    
    def _initialize_mock_data(self):
        """Initialize some mock product data"""
        products = [
            {
                "product_id": "PROD-001",
                "product_name": "Laptop - Dell XPS 15",
                "quantity": 45,
                "warehouse": Warehouse.WAREHOUSE_A,
                "price": 1299.99
            },
            {
                "product_id": "PROD-002",
                "product_name": "Laptop - MacBook Pro 14",
                "quantity": 12,
                "warehouse": Warehouse.WAREHOUSE_B,
                "price": 1999.99
            },
            {
                "product_id": "PROD-003",
                "product_name": "Wireless Mouse",
                "quantity": 0,
                "warehouse": Warehouse.WAREHOUSE_C,
                "price": 29.99,
                "next_restock": (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
            },
            {
                "product_id": "PROD-004",
                "product_name": "USB-C Hub",
                "quantity": 156,
                "warehouse": Warehouse.WAREHOUSE_A,
                "price": 49.99
            },
            {
                "product_id": "PROD-005",
                "product_name": "Mechanical Keyboard",
                "quantity": 3,
                "warehouse": Warehouse.WAREHOUSE_D,
                "price": 149.99
            },
            {
                "product_id": "PROD-006",
                "product_name": "4K Monitor",
                "quantity": 28,
                "warehouse": Warehouse.WAREHOUSE_B,
                "price": 599.99
            },
            {
                "product_id": "PROD-007",
                "product_name": "Webcam HD",
                "quantity": 0,
                "warehouse": Warehouse.WAREHOUSE_C,
                "price": 79.99,
                "next_restock": (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%d")
            }
        ]
        
        for product in products:
            self._products[product["product_id"]] = product
    
    async def check_stock(
        self,
        product_id: str
    ) -> StockResponse:
        """
        Check stock availability for a product.
        
        Args:
            product_id: The product identifier
            
        Returns:
            StockResponse with availability details
            
        Raises:
            ValueError: If product not found
        """
        self.api_calls += 1
        
        # Simulate API delay
        await asyncio.sleep(random() * 0.2)  # 0-200ms delay
        
        # Simulate occasional API errors (3% chance)
        if random() < 0.03:
            self.failed_calls += 1
            raise ValueError(f"API Error: Unable to connect to inventory system")
        
        # Look up product
        if product_id not in self._products:
            self.failed_calls += 1
            raise ValueError(f"Product {product_id} not found")
        
        product = self._products[product_id]
        self.successful_calls += 1
        
        # Determine stock status
        quantity = product["quantity"]
        if quantity == 0:
            status = StockStatus.OUT_OF_STOCK
            in_stock = False
        elif quantity < 10:
            status = StockStatus.LOW_STOCK
            in_stock = True
        else:
            status = StockStatus.IN_STOCK
            in_stock = True
        
        # Find alternative products if out of stock
        alternatives = []
        if not in_stock:
            alternatives = self._find_alternatives(product_id)
        
        return StockResponse(
            product_id=product_id,
            product_name=product["product_name"],
            in_stock=in_stock,
            quantity=quantity,
            status=status,
            warehouse=product["warehouse"],
            price=product["price"],
            next_restock=product.get("next_restock"),
            alternatives=alternatives
        )
    
    async def reserve_stock(
        self,
        product_id: str,
        quantity: int,
        order_id: str
    ) -> ReservationResponse:
        """
        Reserve inventory for an order.
        
        Args:
            product_id: The product identifier
            quantity: Quantity to reserve
            order_id: Order identifier
            
        Returns:
            ReservationResponse with reservation details
            
        Raises:
            ValueError: If product not found or insufficient stock
        """
        self.api_calls += 1
        
        # Simulate API delay
        await asyncio.sleep(random() * 0.3)
        
        # Look up product
        if product_id not in self._products:
            self.failed_calls += 1
            raise ValueError(f"Product {product_id} not found")
        
        product = self._products[product_id]
        
        # Check if sufficient stock
        if product["quantity"] < quantity:
            self.failed_calls += 1
            raise ValueError(
                f"Insufficient stock. Available: {product['quantity']}, Requested: {quantity}"
            )
        
        # Create reservation
        reservation_id = f"RES-{uuid4().hex[:8].upper()}"
        expires_at = datetime.utcnow() + timedelta(hours=24)  # 24-hour hold
        
        self._reservations[reservation_id] = {
            "reservation_id": reservation_id,
            "product_id": product_id,
            "quantity": quantity,
            "order_id": order_id,
            "warehouse": product["warehouse"],
            "expires_at": expires_at,
            "created_at": datetime.utcnow()
        }
        
        # Reduce available quantity
        product["quantity"] -= quantity
        
        self.successful_calls += 1
        
        return ReservationResponse(
            success=True,
            reservation_id=reservation_id,
            product_id=product_id,
            quantity=quantity,
            order_id=order_id,
            warehouse=product["warehouse"],
            expires_at=expires_at,
            message=f"Successfully reserved {quantity} unit(s). Reservation expires in 24 hours."
        )
    
    async def cancel_reservation(
        self,
        reservation_id: str
    ) -> Dict[str, Any]:
        """
        Cancel an inventory reservation.
        
        Args:
            reservation_id: The reservation identifier
            
        Returns:
            Cancellation confirmation
            
        Raises:
            ValueError: If reservation not found
        """
        self.api_calls += 1
        
        # Simulate API delay
        await asyncio.sleep(random() * 0.15)
        
        if reservation_id not in self._reservations:
            self.failed_calls += 1
            raise ValueError(f"Reservation {reservation_id} not found")
        
        reservation = self._reservations[reservation_id]
        
        # Return quantity to inventory
        product = self._products[reservation["product_id"]]
        product["quantity"] += reservation["quantity"]
        
        # Remove reservation
        del self._reservations[reservation_id]
        
        self.successful_calls += 1
        
        return {
            "success": True,
            "reservation_id": reservation_id,
            "message": "Reservation cancelled successfully",
            "quantity_returned": reservation["quantity"]
        }
    
    async def get_warehouse_stock(
        self,
        warehouse: Warehouse
    ) -> List[Dict[str, Any]]:
        """
        Get all stock for a specific warehouse.
        
        Args:
            warehouse: The warehouse location
            
        Returns:
            List of products in warehouse
        """
        self.api_calls += 1
        
        # Simulate API delay
        await asyncio.sleep(random() * 0.25)
        
        warehouse_stock = []
        for product_id, product in self._products.items():
            if product["warehouse"] == warehouse:
                warehouse_stock.append({
                    "product_id": product_id,
                    "product_name": product["product_name"],
                    "quantity": product["quantity"],
                    "price": product["price"]
                })
        
        self.successful_calls += 1
        return warehouse_stock
    
    def _find_alternatives(
        self,
        product_id: str,
        max_alternatives: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Find alternative products.
        
        Args:
            product_id: The original product ID
            max_alternatives: Maximum number of alternatives
            
        Returns:
            List of alternative products
        """
        product = self._products.get(product_id)
        if not product:
            return []
        
        # Simple logic: find products in same category (based on name similarity)
        # In real system, would use proper categorization
        product_name = product["product_name"].lower()
        category_keywords = product_name.split()[0:2]  # First two words
        
        alternatives = []
        for alt_id, alt_product in self._products.items():
            if alt_id == product_id:
                continue
            
            # Check if alternative is in stock
            if alt_product["quantity"] == 0:
                continue
            
            # Check if similar category
            alt_name = alt_product["product_name"].lower()
            if any(keyword in alt_name for keyword in category_keywords):
                alternatives.append({
                    "product_id": alt_id,
                    "product_name": alt_product["product_name"],
                    "quantity": alt_product["quantity"],
                    "price": alt_product["price"],
                    "warehouse": alt_product["warehouse"].value
                })
            
            if len(alternatives) >= max_alternatives:
                break
        
        return alternatives
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get API statistics.
        
        Returns:
            Dictionary with statistics
        """
        success_rate = 0.0
        if self.api_calls > 0:
            success_rate = self.successful_calls / self.api_calls
        
        # Calculate total inventory value
        total_value = sum(
            p["quantity"] * p["price"]
            for p in self._products.values()
        )
        
        # Count products by status
        in_stock_count = sum(1 for p in self._products.values() if p["quantity"] > 0)
        out_of_stock_count = sum(1 for p in self._products.values() if p["quantity"] == 0)
        
        return {
            "total_api_calls": self.api_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "success_rate": round(success_rate, 3),
            "total_products": len(self._products),
            "in_stock_products": in_stock_count,
            "out_of_stock_products": out_of_stock_count,
            "active_reservations": len(self._reservations),
            "total_inventory_value": round(total_value, 2)
        }


# Global inventory API instance
_inventory_api: Optional[MockInventoryAPI] = None


def get_inventory_api() -> MockInventoryAPI:
    """
    Get the global inventory API instance.
    
    Returns:
        The inventory API
    """
    global _inventory_api
    if _inventory_api is None:
        _inventory_api = MockInventoryAPI()
    return _inventory_api

# Made with Bob

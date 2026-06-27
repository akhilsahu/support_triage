"""
Mock Orders API — for testing data source integration.

Simulates 3 separate org APIs, each with a different field schema.
All require header: X-API-Key: test-key-123

Each API accepts an optional order ID param matching its own field name:
  acme:   ?order_id=ORD-1001  or  ORD-1002
  vertex: ?id=20050           or  20051
  nova:   ?ref=REF-88821      or  REF-88822

Without the param, all orders are returned.
"""

from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional

router = APIRouter(prefix="/mock", tags=["Mock API"])

MOCK_KEY = "test-key-123"

ACME_ORDERS = [
    {
        "order_id":          "ORD-1001",
        "order_status":      "Shipped",
        "date_order_placed": "2026-05-01",
        "customer_name":     "Alice Johnson",
        "product_name":      "Wireless Headphones",
        "order_total":       "129.99",
        "tracking_number":   "TRK-9921A",
        "shipping_carrier":  "FedEx",
        "expected_delivery": "2026-05-06",
        "shipping_address":  "123 Maple St, Austin TX",
    },
    {
        "order_id":          "ORD-1002",
        "order_status":      "Processing",
        "date_order_placed": "2026-05-03",
        "customer_name":     "Bob Lee",
        "product_name":      "Mechanical Keyboard",
        "order_total":       "89.00",
        "tracking_number":   None,
        "shipping_carrier":  None,
        "expected_delivery": "2026-05-09",
        "shipping_address":  "456 Oak Ave, Denver CO",
    },
]

VERTEX_ORDERS = [
    {
        "id":          "20050",
        "status":      "delivered",
        "order_date":  "2026-04-28",
        "buyer":       "Carol White",
        "item_desc":   "Standing Desk",
        "amount_paid": "499.00",
        "track_id":    "UPS-772XB",
        "courier":     "UPS",
        "deliver_by":  "2026-05-05",
        "location":    "Last seen: Chicago distribution center",
    },
    {
        "id":          "20051",
        "status":      "returned",
        "order_date":  "2026-04-30",
        "buyer":       "Dan Brown",
        "item_desc":   "Monitor Stand",
        "amount_paid": "45.00",
        "track_id":    "UPS-991ZZ",
        "courier":     "UPS",
        "deliver_by":  "2026-05-07",
        "location":    None,
    },
]

NOVA_ORDERS = [
    {
        "ref":           "REF-88821",
        "state":         "in_transit",
        "created":       "2026-05-02T10:30:00Z",
        "recipient":     "Eve Davis",
        "description":   "Smart Watch",
        "value":         "249.95",
        "parcel_id":     "DHL-4421B",
        "logistics":     "DHL",
        "eta":           "2026-05-08",
        "address":       "789 Pine Rd, Seattle WA",
        "last_location": "In transit — Portland OR hub",
    },
    {
        "ref":           "REF-88822",
        "state":         "pending",
        "created":       "2026-05-04T08:00:00Z",
        "recipient":     "Frank Miller",
        "description":   "Laptop Stand",
        "value":         "59.00",
        "parcel_id":     None,
        "logistics":     None,
        "eta":           "2026-05-12",
        "address":       "321 Elm St, Boston MA",
        "last_location": None,
    },
]


def _check_auth(x_api_key: Optional[str]):
    if x_api_key != MOCK_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key. Use: test-key-123")


# ── Acme Corp — param: order_id ───────────────────────────────────────────────

@router.get("/acme/orders")
async def acme_orders(
    order_id: Optional[str] = Query(default=None, description="Filter by order_id e.g. ORD-1001"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    _check_auth(x_api_key)
    orders = ACME_ORDERS
    if order_id:
        orders = [o for o in orders if o["order_id"] == order_id]
        if not orders:
            raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found.")
    return {"orders": orders, "total": len(orders)}


# ── Vertex Inc — param: id ────────────────────────────────────────────────────

@router.get("/vertex/orders")
async def vertex_orders(
    id: Optional[str] = Query(default=None, description="Filter by id e.g. 20050"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    _check_auth(x_api_key)
    orders = VERTEX_ORDERS
    if id:
        orders = [o for o in orders if o["id"] == id]
        if not orders:
            raise HTTPException(status_code=404, detail=f"Order '{id}' not found.")
    return {"results": orders, "count": len(orders)}


# ── Nova Systems — param: ref ─────────────────────────────────────────────────

@router.get("/nova/orders")
async def nova_orders(
    ref: Optional[str] = Query(default=None, description="Filter by ref e.g. REF-88821"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    _check_auth(x_api_key)
    orders = NOVA_ORDERS
    if ref:
        orders = [o for o in orders if o["ref"] == ref]
        if not orders:
            raise HTTPException(status_code=404, detail=f"Order '{ref}' not found.")
    return orders

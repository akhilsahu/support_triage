"""Mock product catalog for development and testing."""

MOCK_PRODUCTS = {
    "PROD-001": {
        "product_id": "PROD-001",
        "name": "Sony WH-1000XM5 Headphones",
        "category": "Audio",
        "price": 349.99,
        "stock": 12,
        "description": "Industry-leading noise cancelling wireless headphones.",
        "rating": 4.8,
        "tags": ["headphones", "wireless", "noise-cancelling", "sony"],
    },
    "PROD-002": {
        "product_id": "PROD-002",
        "name": "Logitech MX Master 3 Mouse",
        "category": "Peripherals",
        "price": 99.99,
        "stock": 34,
        "description": "Advanced wireless mouse for power users.",
        "rating": 4.7,
        "tags": ["mouse", "wireless", "logitech", "ergonomic"],
    },
    "PROD-003": {
        "product_id": "PROD-003",
        "name": "Keychron K2 Mechanical Keyboard",
        "category": "Peripherals",
        "price": 89.99,
        "stock": 20,
        "description": "Compact wireless mechanical keyboard with RGB.",
        "rating": 4.6,
        "tags": ["keyboard", "mechanical", "wireless", "rgb"],
    },
    "PROD-004": {
        "product_id": "PROD-004",
        "name": "Samsung 27\" 4K Monitor",
        "category": "Displays",
        "price": 429.99,
        "stock": 8,
        "description": "27-inch 4K UHD monitor with HDR support.",
        "rating": 4.5,
        "tags": ["monitor", "4k", "samsung", "hdr"],
    },
    "PROD-005": {
        "product_id": "PROD-005",
        "name": "Apple AirPods Pro (2nd Gen)",
        "category": "Audio",
        "price": 249.99,
        "stock": 25,
        "description": "Active noise cancellation earbuds with spatial audio.",
        "rating": 4.9,
        "tags": ["earbuds", "apple", "airpods", "noise-cancelling"],
    },
    "PROD-006": {
        "product_id": "PROD-006",
        "name": "iPad Air M2",
        "category": "Tablets",
        "price": 699.99,
        "stock": 5,
        "description": "Powerful tablet with M2 chip and 10.9-inch Liquid Retina display.",
        "rating": 4.8,
        "tags": ["tablet", "apple", "ipad", "m2"],
    },
    "PROD-007": {
        "product_id": "PROD-007",
        "name": "Apple Pencil (2nd Gen)",
        "category": "Accessories",
        "price": 129.99,
        "stock": 40,
        "description": "Wireless Apple Pencil with magnetic charging.",
        "rating": 4.7,
        "tags": ["stylus", "apple", "pencil", "ipad"],
    },
    "PROD-008": {
        "product_id": "PROD-008",
        "name": "Anker 65W USB-C Charger",
        "category": "Accessories",
        "price": 35.99,
        "stock": 60,
        "description": "Compact 65W GaN fast charger with USB-C.",
        "rating": 4.6,
        "tags": ["charger", "usb-c", "anker", "fast-charge"],
    },
    "PROD-009": {
        "product_id": "PROD-009",
        "name": "Bose QuietComfort 45",
        "category": "Audio",
        "price": 279.99,
        "stock": 15,
        "description": "Premium noise cancelling over-ear headphones.",
        "rating": 4.7,
        "tags": ["headphones", "bose", "noise-cancelling", "wireless"],
    },
    "PROD-010": {
        "product_id": "PROD-010",
        "name": "Magic Keyboard with Touch ID",
        "category": "Peripherals",
        "price": 149.99,
        "stock": 18,
        "description": "Apple wireless keyboard with Touch ID and numeric keypad.",
        "rating": 4.5,
        "tags": ["keyboard", "apple", "wireless", "touch-id"],
    },
    "PROD-011": {
        "product_id": "PROD-011",
        "name": "LG 34\" UltraWide Monitor",
        "category": "Displays",
        "price": 599.99,
        "stock": 6,
        "description": "34-inch curved ultrawide monitor, 3440x1440 resolution.",
        "rating": 4.6,
        "tags": ["monitor", "ultrawide", "lg", "curved"],
    },
    "PROD-012": {
        "product_id": "PROD-012",
        "name": "Razer DeathAdder V3 Mouse",
        "category": "Peripherals",
        "price": 69.99,
        "stock": 30,
        "description": "Lightweight ergonomic gaming mouse with 30K DPI sensor.",
        "rating": 4.8,
        "tags": ["mouse", "gaming", "razer", "ergonomic"],
    },
    "PROD-013": {
        "product_id": "PROD-013",
        "name": "Jabra Evolve2 85 Headset",
        "category": "Audio",
        "price": 449.99,
        "stock": 10,
        "description": "Professional wireless ANC headset for hybrid work.",
        "rating": 4.5,
        "tags": ["headset", "jabra", "anc", "professional"],
    },
    "PROD-014": {
        "product_id": "PROD-014",
        "name": "CalDigit TS4 Thunderbolt 4 Dock",
        "category": "Accessories",
        "price": 349.99,
        "stock": 9,
        "description": "18-port Thunderbolt 4 dock with 98W host charging.",
        "rating": 4.7,
        "tags": ["dock", "thunderbolt", "usb-c", "caldigit"],
    },
    "PROD-015": {
        "product_id": "PROD-015",
        "name": "Samsung T7 1TB Portable SSD",
        "category": "Storage",
        "price": 89.99,
        "stock": 45,
        "description": "Compact 1TB portable NVMe SSD, 1050MB/s read speed.",
        "rating": 4.8,
        "tags": ["ssd", "portable", "samsung", "storage"],
    },
}

CATEGORIES = sorted({p["category"] for p in MOCK_PRODUCTS.values()})


def search_products(query: str = "", category: str = "") -> list:
    """Filter products by keyword or category."""
    results = list(MOCK_PRODUCTS.values())
    if category:
        results = [p for p in results if p["category"].lower() == category.lower()]
    if query:
        q = query.lower()
        results = [
            p for p in results
            if q in p["name"].lower()
            or q in p["description"].lower()
            or any(q in t for t in p["tags"])
        ]
    return results


def get_product(product_id: str) -> dict | None:
    return MOCK_PRODUCTS.get(product_id)

"""
app/integrations/shopify — Pluggable Shopify integration package
"""

from app.integrations.shopify.routes import router
from app.integrations.shopify.client import ShopifyClient
from app.integrations.shopify.service import handle_shopify_order_update

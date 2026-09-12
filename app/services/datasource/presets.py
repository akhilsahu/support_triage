"""
Master Data Source Presets Registry — aggregates pre-configured inward Data Source presets
for WooCommerce, WordPress Blog, Shopify, Stripe, and Zendesk.
"""

from __future__ import annotations

from typing import Any, Dict, List
import structlog

from app.services.datasource.woocommerce.preset import get_woocommerce_preset
from app.services.datasource.wp.preset import get_wp_preset
from app.services.datasource.shopify.preset import get_shopify_preset
from app.services.datasource.stripe.preset import get_stripe_preset
from app.services.datasource.zendesk.preset import get_zendesk_preset

logger = structlog.get_logger(__name__)


def get_all_presets() -> List[Dict[str, Any]]:
    """
    Retrieves all available pre-configured inward Data Source presets.
    WooCommerce and WordPress Blog are listed prominently at the top.
    """
    logger.info("Gathering all registered inward Data Source presets")

    presets = [
        get_woocommerce_preset(),
        get_wp_preset(),
        get_shopify_preset(),
        get_stripe_preset(),
        get_zendesk_preset(),
    ]

    return presets


__all__ = ["get_all_presets"]

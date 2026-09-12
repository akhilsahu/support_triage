"""
Unit tests for Data Source presets registry and GET /data-sources/presets API endpoint.
"""

import pytest
from app.services.datasource.presets import get_all_presets
from app.services.datasource.woocommerce.preset import get_woocommerce_preset
from app.services.datasource.wp.preset import get_wp_preset
from app.services.datasource.shopify.preset import get_shopify_preset
from app.services.datasource.stripe.preset import get_stripe_preset
from app.services.datasource.zendesk.preset import get_zendesk_preset


def test_get_all_presets():
    """Verify that all platform presets are properly registered."""
    presets = get_all_presets()
    assert len(presets) == 5
    preset_ids = [p["id"] for p in presets]
    assert "woocommerce" in preset_ids
    assert "wp_blog" in preset_ids
    assert "shopify" in preset_ids
    assert "stripe" in preset_ids
    assert "zendesk" in preset_ids


def test_woocommerce_preset_schema():
    """Verify WooCommerce preset tools and credentials schema."""
    wc = get_woocommerce_preset()
    assert wc["id"] == "woocommerce"
    assert wc["api_version"] == "v3"
    assert len(wc["tools"]) >= 5
    tool_names = [t["name"] for t in wc["tools"]]
    assert "wc_get_order_by_id" in tool_names
    assert "wc_list_customer_orders" in tool_names
    assert "wc_search_products" in tool_names
    assert "wc_get_product_by_id" in tool_names
    assert "wc_get_customer_by_id" in tool_names

    cred_names = [c["name"] for c in wc["required_credentials"]]
    assert "site_url" in cred_names
    assert "consumer_key" in cred_names
    assert "consumer_secret" in cred_names


def test_wordpress_preset_schema():
    """Verify WordPress Blog preset tools and credentials schema."""
    wp = get_wp_preset()
    assert wp["id"] == "wp_blog"
    assert wp["api_version"] == "v2"
    assert len(wp["tools"]) >= 4
    tool_names = [t["name"] for t in wp["tools"]]
    assert "wp_search_posts" in tool_names
    assert "wp_get_post_by_id" in tool_names
    assert "wp_search_pages" in tool_names
    assert "wp_get_comments" in tool_names

    cred_names = [c["name"] for c in wp["required_credentials"]]
    assert "site_url" in cred_names


def test_shopify_preset_schema():
    """Verify Shopify preset tools and credentials schema."""
    shopify = get_shopify_preset()
    assert shopify["id"] == "shopify"
    assert len(shopify["tools"]) >= 2
    cred_names = [c["name"] for c in shopify["required_credentials"]]
    assert "shop_url" in cred_names
    assert "access_token" in cred_names


def test_stripe_preset_schema():
    """Verify Stripe preset tools and credentials schema."""
    stripe = get_stripe_preset()
    assert stripe["id"] == "stripe"
    assert len(stripe["tools"]) >= 2


def test_zendesk_preset_schema():
    """Verify Zendesk preset tools and credentials schema."""
    zendesk = get_zendesk_preset()
    assert zendesk["id"] == "zendesk"
    assert len(zendesk["tools"]) >= 1

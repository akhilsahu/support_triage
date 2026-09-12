"""
WordPress Data Source Module — self-contained provider for WordPress REST API v2.
"""

from app.services.datasource.wp.preset import get_wp_preset, get_wp_tools

__all__ = ["get_wp_preset", "get_wp_tools"]

"""
Reserved Slugs Utility for Yullo Handle Claims.
Leverages system settings.RESERVED_SLUGS from app.config.
"""

from app.config import settings


def is_reserved_slug(slug: str) -> bool:
    """Checks if a given handle/slug is reserved by the system."""
    if not slug:
        return True
    return slug.strip().lower() in set(settings.RESERVED_SLUGS)

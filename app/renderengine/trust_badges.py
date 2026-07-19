"""
Admin-authored trust badges for the homepage 'trust_badges' section.

Same treatment as quick_topics.py -- no AI/cache/timeout, purely static
content the space admin defines themselves. This module only parses/
validates Chatbot.trust_badges; app/api/space.py reads it directly.
"""
from __future__ import annotations

import json

_MAX_BADGES = 6
_MAX_BADGE_CHARS = 40


def parse_trust_badges(raw: str | None) -> list[str]:
    """Parse Chatbot.trust_badges for the public API response.
    Never raises -- malformed data degrades to an empty list (section
    renders nothing), same as no badges being configured at all."""
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        badges = [b.strip()[:_MAX_BADGE_CHARS] for b in data if isinstance(b, str) and b.strip()]
        return badges[:_MAX_BADGES]
    except Exception:
        return []


def validate_trust_badges_payload(raw: str | None) -> str | None:
    """
    Validate an admin-submitted trust_badges payload before persisting.
    Raises ValueError on bad input. None/empty clears the badges.
    """
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        raise ValueError("trust_badges must be valid JSON")
    if not isinstance(data, list):
        raise ValueError("trust_badges must be a JSON array of strings")
    if len(data) > _MAX_BADGES:
        raise ValueError(f"trust_badges supports at most {_MAX_BADGES} badges")
    for item in data:
        if not isinstance(item, str) or not item.strip():
            raise ValueError("each trust_badges entry must be a non-empty string")
    return raw

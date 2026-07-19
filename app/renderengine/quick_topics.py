"""
Admin-authored quick-topic buttons for the homepage 'quick_topics' section.

Unlike the other renderengine modules, this has no AI/cache/timeout
involved -- it's static content the space admin defines themselves (same
treatment as homepage_sections_override's "promo"). This module only
parses/validates Chatbot.quick_topics; app/api/space.py reads it directly.
"""
from __future__ import annotations

import json

_MAX_TOPICS = 6
_MAX_LABEL_CHARS = 40
_MAX_PROMPT_CHARS = 300


def parse_quick_topics(raw: str | None) -> list[dict]:
    """Parse Chatbot.quick_topics for the public API response.
    Never raises -- malformed data degrades to an empty list (section renders
    nothing), same as no topics being configured at all."""
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        topics = []
        for item in data:
            if not isinstance(item, dict):
                continue
            label = item.get("label")
            prompt = item.get("prompt")
            if isinstance(label, str) and isinstance(prompt, str) and label.strip() and prompt.strip():
                topics.append({"label": label.strip()[:_MAX_LABEL_CHARS], "prompt": prompt.strip()[:_MAX_PROMPT_CHARS]})
        return topics[:_MAX_TOPICS]
    except Exception:
        return []


def validate_quick_topics_payload(raw: str | None) -> str | None:
    """
    Validate an admin-submitted quick_topics payload (from ChatbotProfile /
    the PATCH /api/v1/chatbots/{slug} endpoint) before persisting. Raises
    ValueError on bad input -- an admin submitting a form should get a clear
    400, not a silent partial save. None/empty clears the topics.
    """
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        raise ValueError("quick_topics must be valid JSON")
    if not isinstance(data, list):
        raise ValueError("quick_topics must be a JSON array")
    if len(data) > _MAX_TOPICS:
        raise ValueError(f"quick_topics supports at most {_MAX_TOPICS} topics")
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("each quick_topics entry must be an object")
        label, prompt = item.get("label"), item.get("prompt")
        if not isinstance(label, str) or not label.strip():
            raise ValueError("each quick_topics entry needs a non-empty 'label'")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("each quick_topics entry needs a non-empty 'prompt'")
    return raw

"""
Slugification for user-typed grouping keys (topic, doc label).

These values become ChromaDB metadata filtered with `$eq` / `$in`, so "SBI Prime
CC", "sbi prime cc" and "SBI  Prime  CC" have to collapse to one key — otherwise
a filter silently matches nothing and the failure looks like missing documents
rather than a typo.

Same rule already used for agent slugs (app/api/v1/space_agents.py), lifted here
so both sides cannot drift.
"""

from __future__ import annotations

import re

_MAX_LEN = 120


def slugify(value: str, *, max_len: int = _MAX_LEN) -> str:
    """
    "SBI Card PRIME (2026)" -> "sbi_card_prime_2026"

    Returns "" for input that is empty or made entirely of separators, which
    callers treat as "not set" rather than as a key.
    """
    if not value:
        return ""
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9_]", "_", value.lower().strip()))[:max_len].strip("_")

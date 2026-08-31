"""Recursive redaction helpers for logs, diagnostics, and previews."""

from __future__ import annotations

from collections.abc import Collection, Mapping
from typing import Any

REDACTED = "[REDACTED]"
DEFAULT_SENSITIVE_KEYS = frozenset(
    {
        "authorization",
        "proxy-authorization",
        "api-key",
        "x-api-key",
        "apikey",
        "password",
        "secret",
        "encrypted-secret",
        "credential",
        "credentials",
        "client-secret",
        "token",
        "access-token",
        "refresh-token",
        "cookie",
        "set-cookie",
    }
)


def _normalize_key(key: object) -> str:
    return str(key).strip().lower().replace("_", "-")


def sanitize_mapping(
    value: Any,
    sensitive_keys: Collection[str] = DEFAULT_SENSITIVE_KEYS,
) -> Any:
    """Return a recursively copied value with sensitive mapping values redacted."""

    normalized_keys = {_normalize_key(key) for key in DEFAULT_SENSITIVE_KEYS}
    normalized_keys.update(_normalize_key(key) for key in sensitive_keys)

    def sanitize(current: Any) -> Any:
        if isinstance(current, Mapping):
            return {
                key: REDACTED if _normalize_key(key) in normalized_keys else sanitize(child)
                for key, child in current.items()
            }
        if isinstance(current, list):
            return [sanitize(child) for child in current]
        if isinstance(current, tuple):
            return tuple(sanitize(child) for child in current)
        if isinstance(current, set):
            return {sanitize(child) for child in current}
        return current

    return sanitize(value)

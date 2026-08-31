"""Validation rules for data source tool configuration."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from app.services.datasource.contracts import ToolConfig

_TOOL_NAME = re.compile(r"^[a-z][a-z0-9_]{2,63}$")
_PLACEHOLDER = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


class ToolValidationError(ValueError):
    """Raised when a tool configuration is unsafe or internally inconsistent."""


def _find_placeholders(value: Any) -> set[str]:
    if isinstance(value, str):
        return set(_PLACEHOLDER.findall(value))
    if isinstance(value, Mapping):
        found: set[str] = set()
        for key, child in value.items():
            found.update(_find_placeholders(key))
            found.update(_find_placeholders(child))
        return found
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        found = set()
        for child in value:
            found.update(_find_placeholders(child))
        return found
    return set()


def validate_tool_config(config: ToolConfig) -> None:
    """Validate a tool before persistence or execution.

    The function is intentionally pure so all API, test, agent, and MCP paths
    enforce the same rules.
    """

    if not _TOOL_NAME.fullmatch(config.name):
        raise ToolValidationError(
            "Tool name must start with a lowercase letter, contain only lowercase "
            "letters, numbers, or underscores, and be 3-64 characters long"
        )

    method = config.method.upper()
    if method not in {"GET", "POST"}:
        raise ToolValidationError(
            "Data source tools are read-only; only GET and safe POST are allowed"
        )
    if method == "POST" and config.risk_classification != "read":
        raise ToolValidationError("POST tools must be explicitly classified as read-only")

    schema = config.input_schema
    if not isinstance(schema, dict) or schema.get("type") != "object":
        raise ToolValidationError("Input schema root must be a JSON Schema object")

    properties = schema.get("properties", {})
    if not isinstance(properties, dict):
        raise ToolValidationError("Input schema properties must be an object")

    required = schema.get("required", [])
    if not isinstance(required, list) or any(not isinstance(key, str) for key in required):
        raise ToolValidationError("Input schema required must be a list of property names")
    missing_required = sorted(set(required) - set(properties))
    if missing_required:
        raise ToolValidationError(
            f"Required input keys are missing from properties: {', '.join(missing_required)}"
        )

    placeholders = _find_placeholders(config.path)
    placeholders.update(_find_placeholders(config.request_template))
    placeholders.update(_find_placeholders(config.default_headers))
    unbound = sorted(placeholders - set(properties))
    if unbound:
        raise ToolValidationError(
            f"Template placeholders are not declared in input properties: {', '.join(unbound)}"
        )

    if isinstance(config.max_records, bool) or not 1 <= config.max_records <= 100:
        raise ToolValidationError("max_records must be between 1 and 100")
    if isinstance(config.max_response_bytes, bool) or config.max_response_bytes <= 0:
        raise ToolValidationError("max_response_bytes must be greater than zero")

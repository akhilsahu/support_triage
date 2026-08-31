"""Extraction and projection of bounded records from upstream responses."""

from __future__ import annotations

from typing import Any


class ResponseMappingError(ValueError):
    """Raised when an upstream response does not match its configured mapping."""


_MISSING = object()


def _get_path(value: Any, path: str) -> Any:
    current = value
    if not path:
        return current
    for segment in path.split("."):
        if not segment or not isinstance(current, dict) or segment not in current:
            return _MISSING
        current = current[segment]
    return current


def map_response(
    payload: Any,
    record_path: str,
    field_mapping: dict[str, str],
    max_records: int,
) -> list[dict[str, Any]]:
    """Extract records, bound their count, then apply optional field projection.

    ``field_mapping`` maps output field names to dot-separated source paths.
    """

    records = _get_path(payload, record_path)
    if records is _MISSING:
        raise ResponseMappingError(f"Response record path was not found: {record_path or '<root>'}")
    if isinstance(records, dict):
        records = [records]
    elif not isinstance(records, list):
        raise ResponseMappingError("Response record path must resolve to a list or object")

    bounded = records[:max_records]
    if any(not isinstance(record, dict) for record in bounded):
        raise ResponseMappingError("Every response record must be an object")
    if not field_mapping:
        return [dict(record) for record in bounded]

    projected: list[dict[str, Any]] = []
    for record in bounded:
        output: dict[str, Any] = {}
        for output_name, source_path in field_mapping.items():
            value = _get_path(record, source_path)
            output[output_name] = None if value is _MISSING else value
        projected.append(output)
    return projected

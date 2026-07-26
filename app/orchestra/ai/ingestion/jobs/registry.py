"""
Task registry — maps a stable task name to the callable that runs it.

Names (not function references) are what get enqueued, so the same task
resolves identically whether it runs in this process or in a Celery worker that
imported the module fresh.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict

import structlog

logger = structlog.get_logger()

_REGISTRY: Dict[str, Callable[..., Awaitable[Any]]] = {}


def job(name: str) -> Callable:
    """Register an async task under a stable name.

    Usage:
        @job("ingest_document")
        async def ingest_document(job_id: str, ...): ...
    """
    def decorator(fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        if name in _REGISTRY:
            logger.warning("jobs.duplicate_registration", task=name)
        _REGISTRY[name] = fn
        return fn
    return decorator


def get_task(name: str) -> Callable[..., Awaitable[Any]]:
    """Resolve a registered task, or raise if the name is unknown."""
    try:
        return _REGISTRY[name]
    except KeyError:
        raise KeyError(
            f"Unknown job task '{name}'. Registered: {sorted(_REGISTRY)}. "
            "Is the module defining it imported?"
        ) from None


def registered_tasks() -> list[str]:
    return sorted(_REGISTRY)

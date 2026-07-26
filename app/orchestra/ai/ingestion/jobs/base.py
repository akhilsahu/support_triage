"""
JobRunner — the seam between "I want this done in the background" and *how*.

Call sites only ever see this interface, so swapping the in-process runner for
Celery (or anything else) touches one factory and nothing else. That's the whole
point: no Celery import ever appears in an API handler.

Contract for task payloads: JSON-safe values only (ids, paths, primitives).
Never ORM objects, open files or callables — they can't cross a process
boundary, and a task that works in-process but breaks under Celery defeats the
abstraction.
"""

from __future__ import annotations

from typing import Any, Protocol


class JobRunner(Protocol):
    """Enqueue a registered task by name for background execution."""

    def enqueue(self, task_name: str, **payload: Any) -> None:
        """Schedule `task_name` with `payload`. Returns immediately.

        Implementations must not raise for ordinary task failures — the task
        itself records those on its IngestionJob row so the user sees them.
        """
        ...

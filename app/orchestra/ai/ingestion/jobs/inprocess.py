"""
In-process job runner — the default, requiring no extra infrastructure.

Tasks run as asyncio tasks on the running event loop. They're async and offload
their own blocking work to threads, so the loop stays responsive while a job
runs (see app/api/v1/documents.py for why that matters).

Tradeoff, deliberately accepted for the default: a process restart mid-job
orphans it — the row would sit in a non-terminal status forever. `sweep_stale`
exists so those get marked failed rather than spinning in the UI. Switch
JOB_BACKEND to celery for restart-safe durability.
"""

from __future__ import annotations

import asyncio
from typing import Any, Set

import structlog

from app.orchestra.ai.ingestion.jobs.registry import get_task

logger = structlog.get_logger()

# Hold strong references: asyncio only keeps weak ones, so a task without a
# live reference can be garbage-collected mid-flight.
_running: Set[asyncio.Task] = set()


class InProcessJobRunner:
    """Runs tasks on this process's event loop."""

    backend_name = "inprocess"

    def enqueue(self, task_name: str, **payload: Any) -> None:
        fn = get_task(task_name)

        async def _run() -> None:
            try:
                await fn(**payload)
            except Exception as e:
                # The task is responsible for recording failure on its own row;
                # this is the last-resort net so a crash can't kill the loop.
                logger.exception("jobs.task_crashed", task=task_name, error=str(e))

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.error("jobs.no_event_loop", task=task_name)
            raise

        task = loop.create_task(_run())
        _running.add(task)
        task.add_done_callback(_running.discard)
        logger.info("jobs.enqueued", task=task_name, backend=self.backend_name)

    def active_count(self) -> int:
        return len(_running)

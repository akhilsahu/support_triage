"""
Celery ⇄ registry bridge.

The ingestion tasks are async (they await DB writes and thread offloads), but a
Celery worker runs synchronously. This module is the single adapter: one Celery
task that looks a registered task up by name and drives it to completion on its
own event loop.

Using a name-based indirection (rather than one Celery task per function) keeps
the registry the only place tasks are declared, so in-process and Celery execute
exactly the same code path.

Uses @shared_task so this module never imports celery_app — that would be
circular, since celery_app imports this to register the task.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from celery import shared_task

from app.orchestra.ai.ingestion.jobs.registry import get_task

logger = structlog.get_logger()


@shared_task(name="s247.run_job", bind=True)
def run_job(self, task_name: str, payload: dict[str, Any]) -> None:
    """Execute a registered async task inside a Celery worker.

    Failures are recorded on the task's own IngestionJob row (the task handles
    that itself), so this deliberately does not retry — a blind retry of a
    minutes-long ingestion would duplicate work and re-spend vision tokens.
    """
    logger.info("jobs.celery_received", task=task_name, celery_id=self.request.id)
    fn = get_task(task_name)
    try:
        asyncio.run(fn(**payload))
    except Exception as e:
        # The task marks its own row failed; this is the last-resort log so a
        # crash isn't invisible in worker output.
        logger.exception("jobs.celery_task_crashed", task=task_name, error=str(e))

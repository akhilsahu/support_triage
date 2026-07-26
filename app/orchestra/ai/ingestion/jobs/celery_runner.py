"""
Celery-backed JobRunner — durable, survives an app restart.

Selected with JOB_BACKEND=celery. Requires a running worker:

    celery -A app.orchestra.ai.ingestion.jobs.celery_app:celery_app worker \\
           --loglevel=info --queues=s247-ingestion

Same interface as the in-process runner, so call sites are identical.
"""

from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class CeleryJobRunner:
    """Publishes tasks to the Celery queue for a worker to execute."""

    backend_name = "celery"

    # Celery connects lazily, so simply constructing the app proves nothing about
    # the broker. Without an explicit check a dead broker would only surface at
    # enqueue time -- i.e. as a failed upload -- and the factory's fallback to
    # the in-process runner would never fire. Verify up front instead.
    _BROKER_PROBE_TIMEOUT_S = 3.0

    def __init__(self) -> None:
        # Imported here rather than at module scope so selecting this backend is
        # what triggers the celery/broker dependency, never merely importing the
        # jobs package.
        from app.orchestra.ai.ingestion.jobs.celery_app import celery_app
        from app.orchestra.ai.ingestion.jobs.celery_tasks import run_job

        conn = celery_app.connection()
        try:
            conn.ensure_connection(max_retries=0, timeout=self._BROKER_PROBE_TIMEOUT_S)
        finally:
            try:
                conn.release()
            except Exception:
                pass

        self._celery_app = celery_app
        self._run_job = run_job

    def enqueue(self, task_name: str, **payload: Any) -> None:
        result = self._run_job.delay(task_name, payload)
        logger.info("jobs.enqueued", task=task_name,
                    backend=self.backend_name, celery_id=result.id)

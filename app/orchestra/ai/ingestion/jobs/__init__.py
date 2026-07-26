"""
Background job runner for the ingestion pipeline.

Public surface is deliberately tiny — call sites only ever do:

    from app.orchestra.ai.ingestion.jobs import get_job_runner
    get_job_runner().enqueue("ingest_document", job_id=str(job.id), ...)

Which backend actually runs it is a config concern (settings.JOB_BACKEND):

    inprocess  (default) — asyncio tasks, no infrastructure required
    celery                — durable queue, survives restarts

Celery is imported lazily inside its own module, so a missing celery package or
broker can never break the default path.
"""

from __future__ import annotations

import structlog

from app.orchestra.ai.ingestion.jobs.base import JobRunner
from app.orchestra.ai.ingestion.jobs.registry import job, get_task, registered_tasks

# Importing the task module registers the ingestion task by name. Without this
# the registry would be empty until something happened to import it first.
from app.orchestra.ai.ingestion.jobs import tasks  # noqa: F401

logger = structlog.get_logger()

_runner: JobRunner | None = None


def get_job_runner() -> JobRunner:
    """Return the configured job runner (cached)."""
    global _runner
    if _runner is not None:
        return _runner

    from app.config import settings
    backend = (getattr(settings, "JOB_BACKEND", "") or "inprocess").strip().lower()

    if backend == "celery":
        try:
            from app.orchestra.ai.ingestion.jobs.celery_runner import CeleryJobRunner
            _runner = CeleryJobRunner()
            logger.info("jobs.backend_selected", backend="celery")
            return _runner
        except Exception as e:
            # Never let a broker/dependency problem take the app down — degrade
            # to in-process so uploads still work, but say so loudly.
            logger.error("jobs.celery_unavailable_falling_back", error=str(e))

    from app.orchestra.ai.ingestion.jobs.inprocess import InProcessJobRunner
    _runner = InProcessJobRunner()
    logger.info("jobs.backend_selected", backend="inprocess")
    return _runner


def reset_job_runner() -> None:
    """Drop the cached runner — for tests and config reloads."""
    global _runner
    _runner = None


__all__ = ["get_job_runner", "reset_job_runner", "JobRunner", "job", "get_task", "registered_tasks"]

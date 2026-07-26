"""
Celery app for background ingestion.

Imported only when JOB_BACKEND=celery, so neither celery nor a broker is
required to run the application on the default in-process backend.

Redis isolation
---------------
The broker reuses the existing Redis server but on a *different database index*
(CELERY_REDIS_DB, default 1; the app's cache lives on 0). Queue state therefore
can't collide with — or be wiped alongside — cache and rate-limit keys. On top
of that every key Celery writes is namespaced under CELERY_KEY_PREFIX
("s247:jobs:"), so anything queue-related is identifiable at a glance:

    redis-cli -n 1 --scan --pattern 's247:jobs:*'

Worker entrypoint:

    celery -A app.orchestra.ai.ingestion.jobs.celery_app:celery_app worker \\
           --loglevel=info --queues=s247-ingestion
"""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

import structlog
from celery import Celery

from app.config import settings

logger = structlog.get_logger()


def _redis_url_with_db(url: str, db: int) -> str:
    """Point a Redis URL at a specific database index, preserving host/auth."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, f"/{db}", parts.query, parts.fragment))


BROKER_URL = settings.CELERY_BROKER_URL or _redis_url_with_db(
    settings.REDIS_URL, settings.CELERY_REDIS_DB
)
RESULT_BACKEND = settings.CELERY_RESULT_BACKEND or BROKER_URL

celery_app = Celery("support247_ingestion", broker=BROKER_URL, backend=RESULT_BACKEND)

celery_app.conf.update(
    task_default_queue=settings.CELERY_TASK_QUEUE,
    # Namespace every Celery-owned key so queue state is unmistakable in Redis.
    broker_transport_options={"global_keyprefix": settings.CELERY_KEY_PREFIX},
    result_backend_transport_options={"global_keyprefix": settings.CELERY_KEY_PREFIX},
    result_expires=60 * 60 * 24,       # don't accumulate result keys forever
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Ingestion is long-running (minutes) and not idempotent-safe to double-run:
    # only hand a worker one task at a time, and only acknowledge it once it has
    # finished, so a worker crash redelivers rather than silently losing the job.
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_track_started=True,
)

# Importing the bridge registers the Celery task with this app instance.
from app.orchestra.ai.ingestion.jobs import celery_tasks  # noqa: E402,F401

logger.info("jobs.celery_configured",
            broker_db=settings.CELERY_REDIS_DB,
            queue=settings.CELERY_TASK_QUEUE,
            key_prefix=settings.CELERY_KEY_PREFIX)

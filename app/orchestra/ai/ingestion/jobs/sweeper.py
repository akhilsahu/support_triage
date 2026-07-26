"""
Stale-job sweeper — stops interrupted ingestions from hanging forever.

Two distinct failure modes, handled differently because they need different
evidence:

1. **Restart orphans (in-process backend only).** In-process jobs are asyncio
   tasks; they die with the process. So on boot, any job still in a
   non-terminal state provably cannot be running and is marked failed
   immediately. This must NOT be done under Celery, where a queued job legitimately
   survives a restart and is waiting for a worker to pick it up.

2. **Stalled jobs (either backend).** A worker crash, an OOM kill, or a hung
   thread leaves a row that stops advancing. Any non-terminal job whose
   updated_at hasn't moved for STALE_AFTER_MINUTES is treated as dead.

Without this, the dashboard polls such a row indefinitely and the user sees a
progress bar that never finishes and never errors.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog

logger = structlog.get_logger()

# Generous enough that a genuinely slow document (vision over a large scanned
# PDF ran ~6 minutes in the reported case) is never mistaken for a dead one.
STALE_AFTER_MINUTES = 30

_NON_TERMINAL = ("queued", "parsing", "chunking", "indexing")

_RESTART_MSG = "Interrupted by a server restart. Please upload the document again."
_STALLED_MSG = (
    f"Processing stopped unexpectedly (no progress for over {STALE_AFTER_MINUTES} "
    "minutes). Please upload the document again."
)


async def sweep_interrupted_jobs() -> int:
    """Fail jobs that can no longer be making progress. Returns rows updated.

    Safe to call on every boot; never raises, so a sweep problem can't stop the
    application from starting.
    """
    from sqlalchemy import select, or_, and_
    from app.config import settings
    from app.core.database import AsyncSessionLocal
    from app.models.ingestion_job import IngestionJob

    backend = (getattr(settings, "JOB_BACKEND", "") or "inprocess").strip().lower()
    cutoff = datetime.utcnow() - timedelta(minutes=STALE_AFTER_MINUTES)

    try:
        async with AsyncSessionLocal() as db:
            if backend == "celery":
                # Queued work is durable here, so only stalled rows are dead.
                condition = and_(
                    IngestionJob.status.in_(_NON_TERMINAL),
                    IngestionJob.updated_at < cutoff,
                )
            else:
                # In-process: anything mid-flight died with the previous process.
                condition = or_(
                    IngestionJob.status.in_(_NON_TERMINAL),
                    and_(
                        IngestionJob.status.in_(_NON_TERMINAL),
                        IngestionJob.updated_at < cutoff,
                    ),
                )

            rows = (await db.execute(select(IngestionJob).where(condition))).scalars().all()
            for row in rows:
                stalled = row.updated_at is not None and row.updated_at < cutoff
                row.status = "failed"
                row.stage_detail = None
                row.error = _STALLED_MSG if stalled else _RESTART_MSG
            if rows:
                await db.commit()

        if rows:
            logger.warning("ingestion.jobs.swept", count=len(rows), backend=backend,
                           filenames=[r.filename for r in rows][:10])
        return len(rows)

    except Exception as e:
        logger.warning("ingestion.jobs.sweep_failed", error=str(e))
        return 0

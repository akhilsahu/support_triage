from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Any, AsyncIterator, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion_job import IngestionJob
from app.models.knowledge_base import KnowledgeBaseItem
from app.models.kb_fact import KBFact

logger = logging.getLogger(__name__)


class SourceStreamBroadcaster:
    """
    Centralized, isolated stream broadcaster for Yullo Space sources.
    
    Enforces Space boundaries and single-responsibility event dispatch:
    - Emits progress and stage updates.
    - Streams preliminary facts immediately as they are discovered.
    - Notifies connected SSE clients instantly through an in-memory queue.
    - Atomically persists source progress & facts to PostgreSQL.
    """

    def __init__(self) -> None:
        # Maps space_id -> set of asyncio.Queue instances
        self._subscribers: Dict[str, set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def _broadcast_to_subscribers(self, space_id: str | UUID, payload: dict) -> None:
        """Pushes an event payload to all active SSE subscribers for a given space."""
        sid = str(space_id)
        async with self._lock:
            queues = self._subscribers.get(sid, set()).copy()

        for q in queues:
            try:
                q.put_nowait(payload)
            except Exception as e:
                logger.debug("Failed to put event in queue for space %s: %s", sid, e)

    async def emit_progress(
        self,
        db: AsyncSession,
        *,
        space_id: UUID,
        source_id: UUID,
        progress: int,
        stage: str,
        eta_seconds: Optional[int] = None,
    ) -> None:
        """
        Updates job and source item progress and immediately broadcasts to the UI.
        """
        try:
            # 1. Update IngestionJob
            job_stmt = (
                select(IngestionJob)
                .where(IngestionJob.kb_item_id == source_id)
                .order_by(IngestionJob.created_at.desc())
            )
            job = (await db.execute(job_stmt)).scalars().first()
            if job:
                job.progress = progress
                job.stage_detail = stage
                if eta_seconds is not None:
                    job.eta_seconds = eta_seconds
                job.updated_at = datetime.utcnow()

            # 2. Update KnowledgeBaseItem metadata
            item = await db.get(KnowledgeBaseItem, source_id)
            if item and item.space_id == space_id:
                meta = dict(item.source_metadata or {})
                meta["progress"] = progress
                meta["stage"] = stage
                if eta_seconds is not None:
                    meta["eta_seconds"] = eta_seconds
                item.source_metadata = meta

            await db.commit()

            # 3. Broadcast instant event
            await self._broadcast_to_subscribers(
                space_id,
                {
                    "event": "source_progress",
                    "data": {
                        "source_id": str(source_id),
                        "progress": progress,
                        "stage": stage,
                        "eta_seconds": eta_seconds,
                    },
                },
            )
            logger.info(
                "source_stream.progress space_id=%s source_id=%s progress=%d stage=%s",
                space_id,
                source_id,
                progress,
                stage,
            )
        except Exception as e:
            logger.warning("source_stream.progress_failed space_id=%s source_id=%s error=%s", space_id, source_id, e)

    async def emit_facts_streamed(
        self,
        db: AsyncSession,
        *,
        space_id: UUID,
        source_id: UUID,
        facts: List[Dict[str, Any]],
        progress: int = 55,
        stage: str = "Preliminary facts ready",
    ) -> None:
        """
        Persists preliminary extracted facts immediately into KnowledgeBaseItem
        and KBFact so the UI receives and renders them within seconds.
        """
        try:
            item = await db.get(KnowledgeBaseItem, source_id)
            if not item or item.space_id != space_id:
                logger.warning("source_stream.emit_facts_streamed: item %s not in space %s", source_id, space_id)
                return

            # Update item facts and metadata
            item.extracted_facts = facts[:6]
            meta = dict(item.source_metadata or {})
            meta["progress"] = progress
            meta["stage"] = stage
            meta["status"] = "parsing_preview"
            meta["fact_extraction_status"] = "done" if facts else "no_facts_found"
            item.source_metadata = meta

            # Persist to KBFact table if not already present
            existing_facts_stmt = select(KBFact).where(
                KBFact.source_item_id == source_id,
                KBFact.space_id == space_id,
            )
            existing_facts = (await db.execute(existing_facts_stmt)).scalars().all()
            existing_values = {ef.value.strip().casefold() for ef in existing_facts if ef.value}

            subject_title = item.title or "Source Facts"
            for f in facts[:6]:
                val = str(f.get("text") or "").strip()
                if val and val.casefold() not in existing_values:
                    kbf = KBFact(
                        kb_id=item.kb_id,
                        space_id=space_id,
                        subject=subject_title,
                        label="Overview",
                        value=val,
                        note=str(f.get("evidence_excerpt") or "").strip(),
                        review_status="extracted",
                        verified=False,
                        source_item_id=source_id,
                        source_filename=subject_title,
                        source_version=item.source_version or 1,
                    )
                    db.add(kbf)
                    existing_values.add(val.casefold())

            # Update Job
            job_stmt = (
                select(IngestionJob)
                .where(IngestionJob.kb_item_id == source_id)
                .order_by(IngestionJob.created_at.desc())
            )
            job = (await db.execute(job_stmt)).scalars().first()
            if job:
                job.progress = progress
                job.stage_detail = stage
                job.updated_at = datetime.utcnow()

            await db.commit()

            # Broadcast instant event
            await self._broadcast_to_subscribers(
                space_id,
                {
                    "event": "facts_streamed",
                    "data": {
                        "source_id": str(source_id),
                        "facts": facts[:6],
                        "progress": progress,
                        "stage": stage,
                        "count": len(facts),
                    },
                },
            )
            logger.info(
                "source_stream.facts_streamed space_id=%s source_id=%s count=%d",
                space_id,
                source_id,
                len(facts),
            )
        except Exception as e:
            logger.error("source_stream.facts_streamed_failed space_id=%s error=%s", space_id, e, exc_info=True)

    async def emit_completed(
        self,
        db: AsyncSession,
        *,
        space_id: UUID,
        source_id: UUID,
        facts: Optional[List[Dict[str, Any]]] = None,
        assets: Optional[Dict[str, Any]] = None,
        status: str = "ready",
    ) -> None:
        """
        Marks preview extraction complete, updates job to pending_confirm,
        and broadcasts completion to the UI.
        """
        try:
            item = await db.get(KnowledgeBaseItem, source_id)
            if item and item.space_id == space_id:
                item.ingestion_status = status
                meta = dict(item.source_metadata or {})
                meta["status"] = status
                meta["progress"] = 100
                meta["stage"] = "Preview ready"
                if assets:
                    meta["assets"] = assets
                if facts is not None:
                    item.extracted_facts = facts[:6]
                item.source_metadata = meta

            job_stmt = (
                select(IngestionJob)
                .where(IngestionJob.kb_item_id == source_id)
                .order_by(IngestionJob.created_at.desc())
            )
            job = (await db.execute(job_stmt)).scalars().first()
            if job:
                job.status = "pending_confirm"
                job.stage_detail = "Preview ready"
                job.progress = 100
                job.updated_at = datetime.utcnow()

            await db.commit()

            await self._broadcast_to_subscribers(
                space_id,
                {
                    "event": "extraction_completed",
                    "data": {
                        "source_id": str(source_id),
                        "status": status,
                        "progress": 100,
                        "stage": "Preview ready",
                    },
                },
            )
            logger.info("source_stream.completed space_id=%s source_id=%s status=%s", space_id, source_id, status)
        except Exception as e:
            logger.error("source_stream.completed_failed space_id=%s error=%s", space_id, e, exc_info=True)

    async def emit_failed(
        self,
        db: AsyncSession,
        *,
        space_id: UUID,
        source_id: UUID,
        error: str,
    ) -> None:
        """Marks source and job as failed and broadcasts failure event."""
        try:
            item = await db.get(KnowledgeBaseItem, source_id)
            if item and item.space_id == space_id:
                item.ingestion_status = "failed"
                meta = dict(item.source_metadata or {})
                meta["status"] = "failed"
                meta["error_msg"] = error
                item.source_metadata = meta

            job_stmt = (
                select(IngestionJob)
                .where(IngestionJob.kb_item_id == source_id)
                .order_by(IngestionJob.created_at.desc())
            )
            job = (await db.execute(job_stmt)).scalars().first()
            if job:
                job.status = "failed"
                job.stage_detail = error
                job.error = error
                job.updated_at = datetime.utcnow()

            await db.commit()

            await self._broadcast_to_subscribers(
                space_id,
                {
                    "event": "extraction_failed",
                    "data": {
                        "source_id": str(source_id),
                        "error": error,
                    },
                },
            )
            logger.warning("source_stream.failed space_id=%s source_id=%s error=%s", space_id, source_id, error)
        except Exception as e:
            logger.error("source_stream.failed_handler_error space_id=%s error=%s", space_id, e, exc_info=True)

    async def subscribe(
        self,
        space_id: UUID,
        source_fetcher_fn: Any,
    ) -> AsyncIterator[dict]:
        """
        Async generator yielding SSE events for a Space:
        - Yields real-time events as soon as they are pushed to the queue.
        - Emits a periodic update heartbeat (every 4s) so full source state stays synchronized.
        """
        sid = str(space_id)
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)

        async with self._lock:
            if sid not in self._subscribers:
                self._subscribers[sid] = set()
            self._subscribers[sid].add(queue)

        try:
            # Send initial full state immediately upon connect
            initial_data = await source_fetcher_fn()
            yield {
                "event": "update",
                "data": json.dumps(initial_data),
            }

            while True:
                try:
                    # Wait up to 3.5 seconds for instant real-time events
                    event_payload = await asyncio.wait_for(queue.get(), timeout=3.5)
                    # When any event occurs, push full source state so frontend stays 100% consistent
                    latest_data = await source_fetcher_fn()
                    yield {
                        "event": "update",
                        "data": json.dumps(latest_data),
                    }
                except asyncio.TimeoutError:
                    # Heartbeat refresh
                    heartbeat_data = await source_fetcher_fn()
                    yield {
                        "event": "update",
                        "data": json.dumps(heartbeat_data),
                    }
        finally:
            async with self._lock:
                if sid in self._subscribers:
                    self._subscribers[sid].discard(queue)
                    if not self._subscribers[sid]:
                        self._subscribers.pop(sid, None)


# Singleton broadcaster instance
source_stream = SourceStreamBroadcaster()

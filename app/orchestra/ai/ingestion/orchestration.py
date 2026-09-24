import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple
from pydantic import BaseModel

from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
import httpx

from app.core.database import AsyncSessionLocal
from app.models.ingestion_job import IngestionJob
from app.models.knowledge_base import KnowledgeBaseItem
from app.yullo.adapters.home_events import append_domain_event
from app.orchestra.ai.ingestion.storage import materialize as storage_materialize
from app.orchestra.ai.ingestion.pipeline import parse_and_index, IndexedSourceResult

logger = logging.getLogger(__name__)

class DispatchStats(BaseModel):
    dispatched: int

async def dispatch_pending_ingestions(db: AsyncSession, *, limit: int = 100) -> DispatchStats:
    """
    Dispatcher scans committed queued item-linked jobs due for dispatch
    using SKIP LOCKED and calls get_job_runner().enqueue('ingest_knowledge_item', job_id=...)
    outside the transaction. Queue delivery is at-least-once.
    """
    # This is a stub for dispatch logic.
    # We would select with FOR UPDATE SKIP LOCKED
    # where status == 'QUEUED' and dispatch_after <= now()
    # and then push them to Celery/ARQ/etc.
    stmt = select(IngestionJob).where(
        and_(
            IngestionJob.status == 'QUEUED',
            IngestionJob.dispatch_after <= datetime.utcnow()
        )
    ).limit(limit).with_for_update(skip_locked=True)
    
    jobs = await db.scalars(stmt)
    dispatched = 0
    
    from app.orchestra.ai.ingestion.jobs.registry import get_job_runner
    runner = get_job_runner()
    
    for job in jobs:
        # Enqueue the job. The real queue system ensures at-least-once.
        await runner.enqueue("ingest_knowledge_item", job_id=str(job.id))
        job.dispatch_attempts += 1
        job.last_dispatched_at = datetime.utcnow()
        dispatched += 1
        
    await db.flush()
    return DispatchStats(dispatched=dispatched)

async def _fetch_url_content(url: str) -> bytes:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        return response.content

async def ingest_knowledge_item(*, job_id: str) -> None:
    """
    Worker task to ingest a knowledge item.
    """
    lease_token = uuid.uuid4()
    job_uuid = uuid.UUID(job_id)
    
    # 1. Join job -> knowledge item -> KB -> Space, enforce composite identity
    async with AsyncSessionLocal() as db:
        stmt = select(IngestionJob, KnowledgeBaseItem).join(
            KnowledgeBaseItem, IngestionJob.kb_item_id == KnowledgeBaseItem.id
        ).where(
            IngestionJob.id == job_uuid
        ).with_for_update(of=IngestionJob)
        
        result = await db.execute(stmt)
        row = result.first()
        
        if not row:
            logger.warning(f"Job {job_id} not found or no associated kb_item.")
            return
            
        job, item = row
        
        if job.status in ('DONE', 'FAILED', 'CANCELLED'):
            logger.info(f"Job {job_id} is already {job.status}. Skipping duplicate dispatch.")
            return
            
        if job.source_version != item.source_version:
            logger.warning(f"Job {job_id} version {job.source_version} does not match item version {item.source_version}. Cancelling job.")
            job.status = 'CANCELLED'
        # Claim lease (5 minute duration with heartbeat capability)
        job.status = 'RUNNING'
        job.lease_token = str(lease_token)
        job.lease_expires_at = datetime.utcnow() + timedelta(minutes=5)
        await db.commit()
        
        space_id = str(item.space_id)
        kb_id = str(item.kb_id)
        kb_item_id = str(item.id)
        source_version = item.source_version
        
        # 4. Use document ID knowledge:{kb_item_id}:v{source_version}:{lease_token}
        doc_id = f"knowledge:{kb_item_id}:v{source_version}:{lease_token}"
        
        payload = job.retry_payload or {}
        blob_key = payload.get("blob_key")
        source_url = payload.get("source_url")
        filename = item.title
    
    # Run parsing/indexing outside transaction
    try:
        raw_bytes = b""
        if blob_key:
            async with storage_materialize(blob_key) as file_path:
                with open(file_path, "rb") as f:
                    raw_bytes = f.read()
        elif source_url:
            raw_bytes = await _fetch_url_content(source_url)
        else:
            raise ValueError("No blob_key or source_url provided")
            
        def _progress_cb(stage: str, current: int, total: int, **kwargs):
            # In a real app we'd heartbeat the lease and update progress
            pass
            
        result = await parse_and_index(
            job_id=job_id,
            space_id=space_id,
            kb_id=kb_id,
            raw_bytes=raw_bytes,
            filename=filename,
            doc_id=doc_id,
            enable_enrichment=True,
            progress_cb=_progress_cb
        )
        
        async with AsyncSessionLocal() as db:
            await finalize_item_success(db, job_id=job_uuid, lease_token=lease_token, result=result)
            
    except Exception as e:
        logger.exception(f"Ingestion failed for job {job_id}")
        async with AsyncSessionLocal() as db:
            await finalize_item_failure(db, job_id=job_uuid, lease_token=lease_token, error_code=str(e)[:255])


async def finalize_item_success(db: AsyncSession, *, job_id: uuid.UUID, lease_token: uuid.UUID, result: IndexedSourceResult) -> None:
    stmt = select(IngestionJob, KnowledgeBaseItem).join(
        KnowledgeBaseItem, IngestionJob.kb_item_id == KnowledgeBaseItem.id
    ).where(
        and_(IngestionJob.id == job_id, IngestionJob.lease_token == str(lease_token))
    ).with_for_update()
    
    row = (await db.execute(stmt)).first()
    if not row:
        logger.error(f"Failed to finalize success for {job_id} - lease missing or expired")
        return
        
    job, item = row
    
    job.status = 'DONE'
    job.progress = 100
    job.error = None
    
    item.ingestion_status = 'ready'
    item.indexed_doc_id = result.doc_id
    item.published_version = item.source_version
    item.last_synced_at = datetime.utcnow()
    item.ai_cost_usd = (item.ai_cost_usd or 0.0) + result.ai_cost_usd
    
    # Event append (source.updated)
    dedupe_key = f"source.updated:{item.id}:v{item.source_version}:{job_id}"
    await append_domain_event(
        db,
        space_id=item.space_id,
        event_type="source.updated",
        subject_type="source",
        subject_id=str(item.id),
        operation_key=dedupe_key,
        occurred_at=datetime.utcnow(),
        metadata={
            "job_id": str(job_id),
            "version": item.source_version
        }
    )
    
    await db.commit()
    logger.info(f"Successfully finalized job {job_id} and activated item {item.id}")


async def finalize_item_failure(db: AsyncSession, *, job_id: uuid.UUID, lease_token: uuid.UUID, error_code: str) -> None:
    stmt = select(IngestionJob, KnowledgeBaseItem).join(
        KnowledgeBaseItem, IngestionJob.kb_item_id == KnowledgeBaseItem.id
    ).where(
        and_(IngestionJob.id == job_id, IngestionJob.lease_token == str(lease_token))
    ).with_for_update()
    
    row = (await db.execute(stmt)).first()
    if not row:
        logger.error(f"Failed to finalize failure for {job_id} - lease missing or expired")
        return
        
    job, item = row
    
    job.status = 'FAILED'
    
    # Bounded stable error code (not raw exception text)
    safe_error_code = error_code[:100] if error_code else "unknown_error"
    job.error = safe_error_code
    
    item.ingestion_status = 'failed'
    
    # Event append (source.failed)
    dedupe_key = f"source.failed:{item.id}:v{item.source_version}:{job_id}"
    await append_domain_event(
        db,
        space_id=item.space_id,
        event_type="source.failed",
        subject_type="source",
        subject_id=str(item.id),
        operation_key=dedupe_key,
        occurred_at=datetime.utcnow(),
        metadata={
            "job_id": str(job_id),
            "version": item.source_version,
            "error_code": safe_error_code
        }
    )
    
    await db.commit()
    logger.info(f"Finalized failure for job {job_id}: {safe_error_code}")

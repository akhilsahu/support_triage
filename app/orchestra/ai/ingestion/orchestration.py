import asyncio
import structlog
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple
from pydantic import BaseModel

from sqlalchemy import select, and_, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
import httpx

from app.core.database import AsyncSessionLocal
from app.config import settings
from app.models.space import Space
from app.models.ingestion_job import IngestionJob
from app.models.knowledge_base import KnowledgeBaseItem
from app.yullo.adapters.home_events import append_domain_event
from app.orchestra.ai.ingestion.storage import materialize as storage_materialize
from app.orchestra.ai.ingestion.pipeline import parse_and_index, IndexedSourceResult

logger = structlog.get_logger(__name__)

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
            func.lower(IngestionJob.status) == 'queued',
            IngestionJob.dispatch_after <= datetime.utcnow()
        )
    ).limit(limit).with_for_update(skip_locked=True)

    jobs = list((await db.scalars(stmt)).all())
    job_ids = []

    for job in jobs:
        job.dispatch_attempts += 1
        job.last_dispatched_at = datetime.utcnow()
        # Prevent the sweeper/dispatcher from picking this up again before the worker starts
        job.dispatch_after = datetime.utcnow() + timedelta(minutes=10)
        job_ids.append(str(job.id))

    # Commit the transaction BEFORE enqueuing, so the DB changes are visible
    # if the job runner immediately spawns a worker, and we don't enqueue if commit fails.
    await db.commit()

    from app.orchestra.ai.ingestion.jobs.registry import get_job_runner
    runner = get_job_runner()

    dispatched = 0
    for jid in job_ids:
        # Enqueue the job. The real queue system ensures at-least-once.
        runner.enqueue("ingest_knowledge_item", job_id=jid)
        dispatched += 1

    return DispatchStats(dispatched=dispatched)

async def _fetch_url_content(url: str) -> Tuple[bytes, str]:
    """Fetch a URL and retain the parser filename chosen from its content type."""
    from app.orchestra.ai.ingestion.scraper import fetch_url
    page = await fetch_url(url, mode="quick")
    return (page.raw if page.raw else b""), page.filename

from app.orchestra.ai.ingestion.jobs.registry import job

@job("ingest_knowledge_item")
async def ingest_knowledge_item(*, job_id: str) -> None:
    # Yullo deletion must stop active work even when the API and worker differ.
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(
            IngestionJob.space_id, IngestionJob.kb_item_id,
            IngestionJob.source_version, Space.product,
        ).join(Space, Space.id == IngestionJob.space_id).where(
            IngestionJob.id == uuid.UUID(job_id),
        ))).first()
    if not row:
        return
    if row.product != 'yullo' or row.kb_item_id is None:
        await _ingest_knowledge_item(job_id=job_id)
        return
    from app.orchestra.ai.ingestion.cancellation import run_source_work

    await run_source_work(
        lambda: _ingest_knowledge_item(job_id=job_id),
        space_id=row.space_id, source_id=row.kb_item_id,
        doc_ids=(f'knowledge:{row.kb_item_id}:v{row.source_version}',
                 f'preview:{row.kb_item_id}:v{row.source_version}'),
    )


async def _ingest_knowledge_item(*, job_id: str) -> None:
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
        space = await db.get(Space, item.space_id)
        is_yullo = bool(space and space.product == 'yullo')

        # Terminal statuses are lowercase throughout; check both cases for rows
        # written before this fix to avoid re-running already-completed jobs.
        normalized_status = (job.status or "").lower()
        if normalized_status in ('done', 'failed', 'cancelled'):
            logger.info(f"Job {job_id} is already {job.status}. Skipping duplicate dispatch.")
            return

        # At-least-once delivery may enqueue the same job more than once. Do not
        # spend parsing, enrichment, and fact-extraction cost twice while a live
        # worker still owns the lease. An expired lease may be reclaimed.
        if (
            normalized_status == 'running'
            and job.lease_expires_at is not None
            and job.lease_expires_at > datetime.now(job.lease_expires_at.tzinfo)
        ):
            logger.info("ingestion.job_duplicate_ignored", job_id=job_id)
            return

        if ((job.source_version or 1) != (item.source_version or 1) if is_yullo else job.source_version != item.source_version):
            logger.warning(f"Job {job_id} version {job.source_version} does not match item version {item.source_version}. Cancelling job.")
            job.status = 'cancelled'  # lowercase — sweeper and TERMINAL_STATUSES use lowercase
            await db.commit()
            return
        if is_yullo:
            item.source_version = item.source_version or 1
            job.source_version = item.source_version

        # Claim lease (5 minute duration with heartbeat capability)
        # Use lowercase to match sweeper's _NON_TERMINAL tuple and is_terminal check.
        job.status = 'running'
        job.lease_token = lease_token
        job.lease_expires_at = datetime.utcnow() + timedelta(minutes=5)

        is_preview = not (is_yullo or (item.source_metadata or {}).get("is_confirmed", False))
        item.ingestion_status = 'parsing_preview' if is_preview else 'processing'

        await db.commit()

        space_id = str(item.space_id)
        kb_id = str(item.kb_id)
        kb_item_id = str(item.id)
        source_version = item.source_version

        is_confirmed = is_yullo or (item.source_metadata or {}).get("is_confirmed", False)
        space_name = space.display_name if space else ""


        # 4. Use stable document ID to prevent duplicate vectors on retry
        doc_id = f"knowledge:{kb_item_id}:v{source_version}"

        payload = job.retry_payload or {}
        blob_key = payload.get("blob_key")
        source_url = payload.get("source_url")
        # Yullo titles are display labels, not filenames; parser selection needs the blob suffix.
        filename = blob_key.rsplit("/", 1)[-1] if is_yullo and blob_key else item.title

    from app.services.ai_usage_context import ai_usage_scope

    with ai_usage_scope(
        independent=True, space_id=uuid.UUID(space_id), kb_id=uuid.UUID(kb_id),
        product=space.product if space else None, runtime_kind="ingestion",
    ) as costs:
        # Run parsing/indexing outside transaction
        try:
            if is_yullo and item.item_type == 'url' and source_url:
                # Retries use the same quick/deep scraper, private index and
                # fact/entity review path as the initial URL preview.
                from app.yullo.services.sources.preview import extract_and_persist_link_preview
                async with AsyncSessionLocal() as preview_db:
                    await extract_and_persist_link_preview(
                        preview_db, user_id=space.owner_user_id, space_id=uuid.UUID(space_id),
                        item_id=uuid.UUID(kb_item_id), url=source_url,
                    )
                return
            raw_bytes = b""
            meta = dict(item.source_metadata or {})
            extracted_blob = meta.get("extracted_text_blob_key")

            # Prefer the original file to preserve PDF page/table provenance; cached text is a fallback.
            if extracted_blob and not blob_key:
                try:
                    async with storage_materialize(extracted_blob) as file_path:
                        with open(file_path, "rb") as f:
                            raw_bytes = f.read()
                    filename = "extracted_fallback.txt"
                    logger.info(f"Using previously extracted text for {job_id} instead of re-parsing original file.")
                except FileNotFoundError:
                    if blob_key:
                        try:
                            async with storage_materialize(blob_key) as file_path:
                                with open(file_path, "rb") as f:
                                    raw_bytes = f.read()
                        except FileNotFoundError:
                            raise ValueError("Context processing failed, please re-upload the file")
                    else:
                        raise ValueError("Context processing failed, please re-upload the file")
            elif blob_key:
                try:
                    async with storage_materialize(blob_key) as file_path:
                        with open(file_path, "rb") as f:
                            raw_bytes = f.read()
                except FileNotFoundError:
                    raise ValueError("Context processing failed, please re-upload the file")
            elif source_url:
                # The scraper derives a synthetic filename such as page.html or
                # page.pdf from the response Content-Type. Using the display title
                # (for example "SpaceX") leaves the parser with no extension and
                # makes every retry fail before indexing starts.
                raw_bytes, filename = await _fetch_url_content(source_url)
            else:
                raise ValueError("No blob_key or source_url provided")

            loop = asyncio.get_running_loop()
            processing_started_at = datetime.utcnow()
            def _progress_cb(stage: str, current: int, total: int, **kwargs):
                pct = 0
                if is_yullo:
                    # Calibrated for Yullo's 5 stages with proportional progress per batch:
                    # Stage 1: Parsing / Reading source (0% - 20%)
                    # Stage 2: Organizing knowledge (20% - 40%)
                    # Stage 3: Preparing Aura search (40% - 60%)
                    # Stage 4: Finding facts and useful details (60% - 90%)
                    # Stage 5: Finalizing (90% - 98%)
                    total_safe = max(total, 1)
                    frac = min(1.0, max(0.0, current / total_safe))
                    if stage == "parsing":
                        pct = int(frac * 20)
                    elif stage == "chunking":
                        pct = 20 + int(frac * 20)
                    elif stage == "indexing":
                        pct = 40 + int(frac * 20)
                    elif stage in ("facts", "understanding"):
                        pct = 60 + int(frac * 25)
                    elif stage == "entities":
                        pct = 85 + int(frac * 13)
                else:
                    if stage == "parsing": pct = int((current / max(total, 1)) * 30)
                    elif stage == "chunking": pct = 30 + int((current / max(total, 1)) * 10)
                    elif stage == "enriching": pct = 40 + int((current / max(total, 1)) * 40)
                    elif stage == "indexing": pct = 80 + int((current / max(total, 1)) * 10)
                    elif stage == "facts": pct = 90 + int((current / max(total, 1)) * 5)
                    elif stage == "entities": pct = 95 + int((current / max(total, 1)) * 4)
                    elif stage == "understanding": pct = 90 + int((current / max(total, 1)) * 9)

                async def _update_db():
                    async with AsyncSessionLocal() as session:
                        job = await session.get(IngestionJob, job_uuid, with_for_update=True)
                        if job and not job.is_terminal and job.lease_token == lease_token and pct >= (job.progress or 0):
                            job.progress = pct
                            base_stage = {
                                "parsing": "Reading source",
                                "chunking": "Organizing knowledge",
                                "enriching": "Understanding context",
                                "indexing": "Preparing Aura search",
                                "facts": "Extracting facts",
                                "entities": "Extracting entities",
                                "understanding": "Finding facts and useful details",
                            }.get(stage, stage.replace("_", " ").title())

                            if total > 1 and stage in ("parsing", "chunking", "facts", "entities", "understanding"):
                                job.stage_detail = f"{base_stage} ({current} of {total})"
                            else:
                                job.stage_detail = base_stage
                            reported_eta = kwargs.get("eta_seconds")
                            if reported_eta is not None:
                                job.eta_seconds = max(0, int(reported_eta))
                            elif stage in ("facts", "understanding"):
                                # Dynamically calculate remaining time: ~8s per batch remaining
                                remaining_batches = max(0, total - current)
                                job.eta_seconds = max(5, remaining_batches * 8) if total > 0 else 15
                            elif stage == "entities":
                                remaining_batches = max(0, total - current)
                                job.eta_seconds = max(5, remaining_batches * 6) if total > 0 else 10
                            elif 0 < pct < 100:
                                elapsed = max(1, (datetime.utcnow() - processing_started_at).total_seconds())
                                job.eta_seconds = min(3600, max(1, int(elapsed * (100 - pct) / pct)))
                            # Renew lease on progress so long-running documents aren't picked up by another worker
                            job.lease_expires_at = datetime.utcnow() + timedelta(minutes=5)
                            await session.commit()

                try:
                    if asyncio.get_running_loop() is loop:
                        asyncio.create_task(_update_db())
                    else:
                        asyncio.run_coroutine_threadsafe(_update_db(), loop)
                except RuntimeError:
                    asyncio.run_coroutine_threadsafe(_update_db(), loop)

            async def register_assets(prepared):
                from app.yullo.services.sources.assets import register_source_assets
                async with AsyncSessionLocal() as asset_db:
                    await register_source_assets(
                        asset_db, prepared, user_id=space.owner_user_id, space_id=uuid.UUID(space_id),
                        source_id=uuid.UUID(kb_item_id), source_version=source_version,
                        job_id=job_uuid, lease_token=lease_token,
                    )
                    await asset_db.commit()

            result = await parse_and_index(
                job_id=job_id,
                space_id=space_id,
                kb_id=kb_id,
                raw_bytes=raw_bytes,
                filename=filename,
                doc_id=doc_id,
                is_preview=not is_confirmed,
                progress_cb=_progress_cb,
                enable_summary=settings.YULLO_INGESTION_SUMMARY_ENABLED if is_yullo else True,
                web=bool(source_url and not blob_key),
                **({'register_assets': register_assets, 'display_name': item.title} if is_yullo else {}),
            )

            if is_yullo and result.chunk_count:
                from app.yullo.services.sources.service import SourceService
                async with AsyncSessionLocal() as index_db:
                    active = await SourceService().record_source_index(
                        index_db, user_id=space.owner_user_id, space_id=uuid.UUID(space_id),
                        source_id=uuid.UUID(kb_item_id), source_version=source_version,
                        doc_id=result.doc_id, chunk_count=result.chunk_count, page_count=result.page_count,
                        job_id=job_uuid, lease_token=lease_token,
                    )
                if not active:
                    return

            extracted_facts, fact_extraction_error, entity_candidates, entity_extraction_error = await _extract_ingested_knowledge(
                is_confirmed=is_confirmed, is_yullo=is_yullo,
                space_id=space_id, doc_id=doc_id, space_name=space_name,
                job_id=job_id, progress_cb=_progress_cb,
            )

            result.ai_cost_usd = costs.total
            result.ai_cost_details = costs.snapshot()
            async with AsyncSessionLocal() as db:
                published = await finalize_item_success(
                    db,
                    job_id=job_uuid,
                    lease_token=lease_token,
                    result=result,
                    extracted_facts=extracted_facts,
                    fact_extraction_error=fact_extraction_error,
                    entity_candidates=entity_candidates,
                    entity_extraction_error=entity_extraction_error,
                )
            if published and is_yullo:
                try:
                    from app.orchestra.ai.knowledge.vector_store import get_vector_store
                    await asyncio.to_thread(
                        get_vector_store().delete_client_doc, space_id,
                        f'preview:{kb_item_id}:v{source_version}',
                    )
                except Exception as error:
                    logger.warning('ingestion.preview_cleanup_failed', job_id=job_id,
                                   error_type=type(error).__name__)

        except ValueError as e:
            logger.error(f"Ingestion failed for job {job_id}: {str(e)}")
            async with AsyncSessionLocal() as db:
                await finalize_item_failure(db, job_id=job_uuid, lease_token=lease_token, error_code=str(e)[:255],
                                            ai_cost_usd=costs.total, ai_cost_details=costs.snapshot())
        except Exception as e:
            logger.exception(f"Ingestion failed for job {job_id}")
            async with AsyncSessionLocal() as db:
                await finalize_item_failure(db, job_id=job_uuid, lease_token=lease_token, error_code=str(e)[:255],
                                            ai_cost_usd=costs.total, ai_cost_details=costs.snapshot())


async def _extract_ingested_knowledge(
    *, is_confirmed, is_yullo, space_id, doc_id,
    space_name, job_id, progress_cb,
):
    """Extract enabled knowledge from the indexed source, preserving product behavior."""
    extracted_facts = None
    fact_extraction_error = None
    entity_candidates = None
    entity_extraction_error = None
    if is_yullo:
        from app.yullo.config.inference import get_knowledge_features
        features = get_knowledge_features()
        # Preview candidates do not prove coverage of the newly indexed source.
        # Always extract both enabled features from its actual indexed chunks.
        try:
            from app.orchestra.ai.knowledge.extraction.source_extraction import extract_source_knowledge
            from app.yullo.config.inference import get_source_extraction_options
            knowledge = await extract_source_knowledge(
                space_id=space_id, doc_id=doc_id, space_name=space_name,
                config=get_source_extraction_options(features=features), progress_cb=progress_cb,
            )
            extracted_facts = knowledge.facts
            entity_candidates = knowledge.entities
            fact_extraction_error = knowledge.fact_error
            entity_extraction_error = knowledge.entity_error
        except Exception as exc:
            logger.warning("yullo.knowledge.extraction_failed", job_id=job_id, error=type(exc).__name__)
            fact_extraction_error = entity_extraction_error = type(exc).__name__
    elif is_confirmed:
        try:
            from app.orchestra.ai.knowledge.extraction.facts.extractor import extract_facts
            extracted_facts = await extract_facts(space_id=space_id, doc_id=doc_id, progress_cb=progress_cb)
        except Exception as exc:
            logger.warning("facts.extraction_failed", job_id=job_id, error=type(exc).__name__)
            fact_extraction_error = type(exc).__name__

    if is_yullo:
        if not features.ingestion_facts_enabled:
            extracted_facts, fact_extraction_error = None, "disabled"
        if not features.ingestion_entities_enabled or not settings.YULLO_ENTITY_EXTRACTION_ENABLED:
            entity_candidates, entity_extraction_error = None, "disabled"
    return extracted_facts, fact_extraction_error, entity_candidates, entity_extraction_error


async def finalize_item_success(
    db: AsyncSession,
    *,
    job_id: uuid.UUID,
    lease_token: uuid.UUID,
    result: IndexedSourceResult,
    extracted_facts: list | None = None,
    fact_extraction_error: str | None = None,
    entity_candidates: list | None = None,
    entity_extraction_error: str | None = None,
) -> bool:
    stmt = select(IngestionJob, KnowledgeBaseItem).join(
        KnowledgeBaseItem, IngestionJob.kb_item_id == KnowledgeBaseItem.id
    ).where(
        and_(IngestionJob.id == job_id, IngestionJob.lease_token == lease_token)
    ).with_for_update()

    row = (await db.execute(stmt)).first()
    if not row:
        logger.error(f"Failed to finalize success for {job_id} - lease missing or expired")
        return False

    job, item = row

    if (job.source_version or 1) != (item.source_version or 1):
        job.status = 'cancelled'
        job.lease_token = None
        await db.commit()
        logger.info('ingestion.stale_result_ignored', job_id=str(job_id))
        return False

    job.status = 'done'  # lowercase — matches TERMINAL_STATUSES and sweeper expectations
    job.progress = 100
    job.eta_seconds = 0
    job.error = None
    job.doc_id = result.doc_id
    job.pages = result.page_count
    job.chunks = result.chunk_count

    product = await db.scalar(select(Space.product).where(Space.id == item.space_id))
    is_preview = product != 'yullo' and not (item.source_metadata or {}).get("is_confirmed", False)

    # Bug 6 fix: track indexing and fact extraction separately so that
    # "the LLM failed" and "no facts found" don't both mask a ready index.
    # Chunks are searchable once indexing succeeds regardless of fact status.
    if is_preview:
        item.ingestion_status = 'ready_to_review'
    else:
        # Indexing always succeeded here (otherwise we'd be in finalize_item_failure)
        item.ingestion_status = 'ready'

    if not is_preview or result.chunk_count > 0:
        item.indexed_doc_id = result.doc_id
    if not is_preview:
        item.published_version = item.source_version

    meta = dict(item.source_metadata or {})
    meta["is_scanned"] = getattr(result, "is_scanned", False)
    meta["page_count"] = result.page_count
    meta["chunk_count"] = result.chunk_count
    if result.chunk_count > 0:
        meta['indexing_status'] = 'done'
        meta['indexed_source_version'] = item.source_version
    if result.full_text is not None:
        meta["raw_text"] = result.full_text
        meta["preview_excerpt"] = result.full_text[:300] + ("..." if len(result.full_text) > 300 else "")
    item.source_metadata = meta

    item.last_synced_at = datetime.utcnow()
    _apply_ingestion_cost(item, job, result.ai_cost_usd, result.ai_cost_details)

    if result.full_text:
        meta = dict(item.source_metadata or {})

        # Store full text in blob storage instead of JSON metadata
        from app.orchestra.ai.ingestion.storage import put as storage_put
        text_blob_key = f"extracted_text_{job_id}.txt"

        actual_blob_key = await storage_put(
            space_id=str(item.space_id),
            key=text_blob_key,
            body=result.full_text.encode("utf-8"),
            content_type="text/plain"
        )

        meta["extracted_text_blob_key"] = actual_blob_key
        meta["preview_excerpt"] = result.full_text[:2000]
        meta["page_count"] = result.page_count
        meta["chunk_count"] = result.chunk_count
        meta["is_scanned"] = result.is_scanned
        meta["status"] = item.ingestion_status
        if "raw_text" in meta:
            del meta["raw_text"]

        item.source_metadata = meta

        # Fact Extraction during full ingestion
        if not is_preview:
            # Bug 6: record fact extraction outcome separately from indexing outcome.
            # extracted_facts=None means the LLM call was skipped or threw; an
            # empty list means the LLM ran but found nothing. Both are distinct
            # from an indexing failure (which lands in finalize_item_failure).
            if fact_extraction_error == "disabled":
                meta["fact_extraction_status"] = "disabled"
                meta.pop("fact_extraction_error", None)
            elif extracted_facts is None:
                meta["fact_extraction_status"] = "failed"
                meta["fact_extraction_error"] = fact_extraction_error or "extraction_unavailable"
            elif len(extracted_facts) == 0:
                diagnostics = getattr(extracted_facts, "diagnostics", {})
                meta["fact_extraction_status"] = (
                    "candidates_rejected" if diagnostics.get("candidates", 0) else "no_facts_found"
                )
                meta.pop("fact_extraction_error", None)
            else:
                meta["fact_extraction_status"] = "done"
                meta.pop("fact_extraction_error", None)
            if extracted_facts is not None:
                meta["fact_extraction_diagnostics"] = getattr(extracted_facts, "diagnostics", {})
            item.source_metadata = meta

            # None means extraction failed, so preserve the last reviewed result.
            # An empty list means extraction succeeded and found no facts, so stale
            # machine candidates must be cleared rather than silently resurfacing.
            if extracted_facts is not None:
                from app.models.kb_fact import KBFact
                from sqlalchemy import select as sa_select, update as sa_update

                # Bug 5: Supersede any previously extracted (unverified) facts for
                # this item before inserting the new batch. This prevents duplicates
                # on retry without discarding human-confirmed facts.
                existing_ids = (
                    await db.scalars(
                        sa_select(KBFact.id).where(
                            KBFact.source_item_id == item.id,
                            KBFact.source_version == item.source_version,
                            # Only supersede unverified machine-extracted rows;
                            # owner_confirmed / source_authoritative rows need
                            # human action before they can be replaced.
                            KBFact.review_status == 'extracted',
                            KBFact.superseded_by_id.is_(None),
                        )
                    )
                ).all()

                if existing_ids:
                    logger.info(
                        "ingestion.finalize.superseding_old_facts",
                        item_id=str(item.id),
                        count=len(existing_ids),
                    )

                item.extracted_facts = extracted_facts

                new_facts: list[KBFact] = []
                for f in extracted_facts:
                    new_fact = KBFact(
                        kb_id=item.kb_id,
                        space_id=item.space_id,
                        verified=False,
                        review_status='extracted',
                        valid_from=datetime.utcnow(),
                        subject=f.get('subject', ''),
                        label=f.get('label', ''),
                        value=f.get('value', ''),
                        note=f.get('note', ''),
                        topic=f.get('topic', ''),
                        source_doc_id=result.doc_id,
                        source_item_id=item.id,
                        source_filename=item.title,
                        source_version=item.source_version,
                        source_page=f.get('source_page'),
                        source_chunk_id=f.get('source_chunk_id'),
                    )
                    db.add(new_fact)
                    new_facts.append(new_fact)

                # Flush to get new fact PKs, then mark the old rows as superseded.
                # We can't self-supersede (check constraint), so we link old → first
                # new fact as a sentinel — the superseded flag is what matters for
                # retrieval, not which specific replacement it points to.
                await db.flush()

                if existing_ids and new_facts:
                    sentinel_id = new_facts[0].id
                    await db.execute(
                        sa_update(KBFact)
                        .where(KBFact.id.in_(existing_ids))
                        .values(
                            review_status='superseded',
                            superseded_by_id=sentinel_id,
                        )
                    )
                    logger.info(
                        "ingestion.finalize.superseded_old_facts",
                        item_id=str(item.id),
                        count=len(existing_ids),
                        sentinel_id=str(sentinel_id),
                    )
                elif existing_ids:
                    # No replacement exists, so retire the obsolete machine rows.
                    await db.execute(
                        sa_update(KBFact)
                        .where(KBFact.id.in_(existing_ids))
                        .values(
                            review_status='rejected',
                            verified=False,
                            superseded_by_id=None,
                        )
                    )

            if entity_extraction_error == "disabled":
                meta["entity_extraction_status"] = "disabled"
                meta.pop("entity_extraction_error", None)
            elif entity_candidates is None:
                meta["entity_extraction_status"] = "failed"
                meta["entity_extraction_error"] = entity_extraction_error or "extraction_unavailable"
            elif not entity_candidates:
                from app.yullo.services.entities.extraction import persist_entity_candidates
                await persist_entity_candidates(
                    db, source_item_id=item.id, source_version=item.source_version, candidates=[]
                )
                meta["entity_extraction_status"] = "no_entities_found"
                meta.pop("entity_extraction_error", None)
            else:
                from app.yullo.services.entities.extraction import persist_entity_candidates

                await persist_entity_candidates(
                    db,
                    source_item_id=item.id,
                    source_version=item.source_version,
                    candidates=entity_candidates,
                )
                meta["entity_extraction_status"] = "done"
                meta.pop("entity_extraction_error", None)
            meta["entity_extraction_prompt_version"] = settings.YULLO_KNOWLEDGE_PROMPT_VERSION
            item.source_metadata = meta


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
    return not is_preview


def _apply_ingestion_cost(item, job, total, details):
    # Keep known subtotals even when another call could not be priced.
    meta = dict(item.source_metadata or {})
    item.ai_cost_usd = (item.ai_cost_usd or 0.0) + details.get("known_usd", total or 0.0)
    meta["ai_cost_details"] = details
    meta["ai_cost_incomplete"] = bool(meta.get("ai_cost_incomplete") or total is None)
    item.source_metadata = meta
    job.ai_cost_usd = total


async def finalize_item_failure(db: AsyncSession, *, job_id: uuid.UUID, lease_token: uuid.UUID, error_code: str,
                                ai_cost_usd: float | None = None, ai_cost_details: dict | None = None) -> None:
    stmt = select(IngestionJob, KnowledgeBaseItem).join(
        KnowledgeBaseItem, IngestionJob.kb_item_id == KnowledgeBaseItem.id
    ).where(
        and_(IngestionJob.id == job_id, IngestionJob.lease_token == lease_token)
    ).with_for_update()

    row = (await db.execute(stmt)).first()
    if not row:
        logger.error(f"Failed to finalize failure for {job_id} - lease missing or expired")
        return

    job, item = row

    if ai_cost_details is not None:
        _apply_ingestion_cost(item, job, ai_cost_usd, ai_cost_details)

    job.status = 'failed'  # lowercase — matches TERMINAL_STATUSES and sweeper expectations
    job.eta_seconds = 0

    # Bounded stable error code (not raw exception text)
    safe_error_code = error_code[:100] if error_code else "unknown_error"
    job.error = safe_error_code

    is_preview = not (item.source_metadata or {}).get("is_confirmed", False)
    item.ingestion_status = 'preview_failed' if is_preview else 'failed'

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

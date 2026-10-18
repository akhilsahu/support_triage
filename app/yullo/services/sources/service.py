import hashlib
import json
import logging
import re
import uuid
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ingestion_job import IngestionJob
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.models.space import Space
from app.orchestra.ai.ingestion.storage import put as storage_put
from app.orchestra.ai.ingestion.text_sanitize import sanitize_extracted_text
from app.yullo.services.sources.contracts import SourceInput, SourceAccepted, TextSourceInput, UrlSourceInput, FileSourceInput
from app.schemas.yullo_onboarding import SpaceSourceResponse

logger = logging.getLogger(__name__)


class SourceService:
    @staticmethod
    async def _resolve_primary_kb(db: AsyncSession, space_id: UUID, create_if_missing: bool = True) -> UUID | None:
        """
        Resolve or create the primary knowledge base for the Yullo Space.
        Assumes the YulloSpace is already locked by the caller.
        """
        # Fetch config
        stmt = select(YulloConfig).where(YulloConfig.space_id == space_id)
        config = await db.scalar(stmt)
        if not config:
            if not create_if_missing:
                return None
            config = YulloConfig(space_id=space_id, settings={})
            db.add(config)
            await db.flush()
            
        settings = config.settings or {}
        knowledge_settings = settings.get("knowledge", {})
        primary_kb_id_str = knowledge_settings.get("primary_kb_id")
        
        if primary_kb_id_str:
            primary_kb_id = UUID(primary_kb_id_str)
            stmt = select(KnowledgeBase).where(
                and_(KnowledgeBase.id == primary_kb_id, KnowledgeBase.space_id == space_id)
            )
            kb = await db.scalar(stmt)
            if kb and kb.active:
                return kb.id
                
        if not create_if_missing:
            return None
                
        # Create new KB
        new_kb = KnowledgeBase(
            space_id=space_id,
            name="Space knowledge",
            active=True
        )
        db.add(new_kb)
        await db.flush()
        
        knowledge_settings["primary_kb_id"] = str(new_kb.id)
        settings["knowledge"] = knowledge_settings
        config.settings = settings
        db.add(config)
        await db.flush()
        
        return new_kb.id

    @staticmethod
    def _compute_request_hash(command: SourceInput) -> str:
        data = command.model_dump_json(exclude_none=True)
        return hashlib.sha256(data.encode('utf-8')).hexdigest()

    async def accept_source(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        space_id: UUID,
        command: SourceInput,
        idempotency_key: UUID
    ) -> SourceAccepted:
        # 1. External fetching and durability before transaction
        blob_key = None
        if isinstance(command, TextSourceInput):
            # Store text durably
            blob_key = await storage_put(
                space_id=space_id, 
                key=f"text_{idempotency_key}.txt", 
                body=command.text.encode('utf-8'), 
                content_type="text/plain"
            )
        elif isinstance(command, FileSourceInput):
            blob_key = command.blob_key
            
        # 2. Begin transaction; lock owned Yullo Space
        # Note: We rely on the caller to have started the transaction. We lock the space.
        stmt = select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
            Space.id == space_id
        ).with_for_update(of=Space)
        row = await db.execute(stmt)
        row = row.first()
        if not row:
            raise HTTPException(status_code=404, detail="Yullo space not found")
        space, yullo_space = row
        
        if space.owner_user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this space")
            
        # Resolve/create primary KB
        primary_kb_id = await self._resolve_primary_kb(db, space_id)
        
        # 3. Check for idempotency conflicts
        creation_key = str(idempotency_key)
        stmt = select(KnowledgeBaseItem).where(
            and_(KnowledgeBaseItem.space_id == space_id, KnowledgeBaseItem.creation_key == creation_key)
        )
        existing_item = await db.scalar(stmt)
        
        request_hash = self._compute_request_hash(command)
        
        if existing_item:
            if existing_item.content_hash != request_hash:
                raise HTTPException(status_code=409, detail="Idempotency key reused with different payload")
            
            # Find the existing job
            stmt = select(IngestionJob).where(IngestionJob.kb_item_id == existing_item.id).order_by(IngestionJob.created_at.desc())
            existing_job = await db.scalar(stmt)
            if not existing_job:
                raise HTTPException(status_code=500, detail="Found item but no associated ingestion job")
                
            return SourceAccepted(
                item_id=existing_item.id,
                job_id=existing_job.id,
                source_version=existing_item.source_version or 1,
                status="uploaded"
            )

        # 4. Insert KnowledgeBaseItem
        title = command.title or command.url
        new_item = KnowledgeBaseItem(
            space_id=space_id,
            kb_id=primary_kb_id,
            title=title,
            ingestion_status="uploaded",
            source_version=1,
            content_hash=request_hash,
            creation_key=creation_key
        )
        
        if isinstance(command, UrlSourceInput):
            new_item.source_locator = command.url
            new_item.item_type = "url"
        else:
            new_item.source_locator = blob_key
            new_item.item_type = "document" if isinstance(command, FileSourceInput) else "text"
            
        db.add(new_item)
        await db.flush()
        
        # 5. Insert IngestionJob
        retry_payload = {
            "schema_version": 1,
            "task_name": "ingest_knowledge_item",
            "kb_item_id": str(new_item.id),
            "source_version": 1,
            "blob_key": blob_key,
            "source_url": command.url if isinstance(command, UrlSourceInput) else None,
            "dispatch_attempts": 0,
            "dispatch_after": datetime.utcnow().isoformat(),
            "last_dispatched_at": None
        }
        
        new_job = IngestionJob(
            space_id=space_id,
            kb_id=primary_kb_id,
            kb_item_id=new_item.id,
            filename=title,
            source_version=1,
            attempt=1,
            idempotency_key=creation_key,
            status="queued",
            retry_payload=retry_payload,
            dispatch_attempts=0,
            dispatch_after=datetime.utcnow(),
        )
        db.add(new_job)
        
        # 6. Increment Yullo context version
        yullo_space.context_version += 1
        db.add(yullo_space)
        
        await db.flush()
        
        # 7. Attempt dispatch happens after commit at the router layer or via outbox
        # We just return the accepted state.
        return SourceAccepted(
            item_id=new_item.id,
            job_id=new_job.id,
            source_version=new_item.source_version,
            status="uploaded"
        )
        
    async def retry_source(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        space_id: UUID,
        item_id: UUID,
        idempotency_key: UUID
    ) -> SourceAccepted:
        # Retry logic: find existing item, add a new job attempt.
        stmt = select(KnowledgeBaseItem).where(
            and_(KnowledgeBaseItem.id == item_id, KnowledgeBaseItem.space_id == space_id)
        )
        item = await db.scalar(stmt)
        if not item:
            raise HTTPException(status_code=404, detail="Knowledge base item not found")
            
        # Find latest job to get max attempt
        stmt = select(IngestionJob).where(IngestionJob.kb_item_id == item_id).order_by(IngestionJob.attempt.desc())
        latest_job = await db.scalar(stmt)
        
        next_attempt = (latest_job.attempt + 1) if latest_job and latest_job.attempt else 1
        
        # Verify ownership
        space_stmt = select(Space.owner_user_id).where(Space.id == space_id)
        owner_id = await db.scalar(space_stmt)
        if owner_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this space")
            
        primary_kb_id = item.kb_id
        
        # Lock space
        stmt = select(YulloSpace).where(YulloSpace.space_id == space_id).with_for_update()
        yullo_space = await db.scalar(stmt)
        if yullo_space:
            yullo_space.context_version += 1
            db.add(yullo_space)
            
        blob_key = item.source_locator if item.item_type != "url" else None
        source_url = item.source_locator if item.item_type == "url" else None
            
        retry_payload = {
            "schema_version": 1,
            "task_name": "ingest_knowledge_item",
            "kb_item_id": str(item.id),
            "source_version": item.source_version,
            "blob_key": blob_key,
            "source_url": source_url,
            "dispatch_attempts": 0,
            "dispatch_after": datetime.utcnow().isoformat(),
            "last_dispatched_at": None
        }
        
        new_job = IngestionJob(
            space_id=space_id,
            kb_id=item.kb_id,
            kb_item_id=item.id,
            filename=item.title,
            source_version=item.source_version,
            attempt=next_attempt,
            idempotency_key=str(idempotency_key),
            status="queued",
            retry_payload=retry_payload,
            dispatch_attempts=0,
            dispatch_after=datetime.utcnow(),
        )
        db.add(new_job)
        await db.flush()
        
        return SourceAccepted(
            item_id=item.id,
            job_id=new_job.id,
            source_version=item.source_version,
            status="queued"
        )

    async def get_space_sources(self, db: AsyncSession, space_id: UUID) -> list[SpaceSourceResponse]:
        """
        List all canonical sources for a space.
        """
        primary_kb_id = await self._resolve_primary_kb(db, space_id, create_if_missing=False)
        if not primary_kb_id:
            return []
        
        # Load KnowledgeBaseItems for this KB
        stmt = select(KnowledgeBaseItem).where(
            KnowledgeBaseItem.kb_id == primary_kb_id
        ).order_by(KnowledgeBaseItem.created_at.desc())
        
        items = (await db.execute(stmt)).scalars().all()
        
        # Get latest job for each item
        sources = []
        for item in items:
            job_stmt = select(IngestionJob).where(
                IngestionJob.kb_item_id == item.id
            ).order_by(IngestionJob.created_at.desc())
            latest_job = (await db.execute(job_stmt)).scalars().first()
            
            error_msg = None
            job_status = (latest_job.status or "").lower() if latest_job else None
            if latest_job and job_status == 'failed':
                error_msg = latest_job.error
                
            status_val = item.ingestion_status
            if latest_job and job_status == 'queued':
                status_val = 'queued'
            elif latest_job and job_status == 'running':
                status_val = 'running'
            elif latest_job and job_status in ('failed', 'cancelled'):
                # A fresh lightweight URL preview may be reviewable even when
                # an older full-ingestion attempt failed. Preserve that newer
                # preview state until the owner confirms it for another run.
                if status_val not in ('ready', 'ready_to_review'):
                    status_val = 'failed'
                if not error_msg and job_status == 'cancelled':
                    error_msg = "Job was unexpectedly cancelled. Please try again."
                
            meta = item.source_metadata or {}
            
            raw_title = item.title or item.source_locator or "Document"
            clean_title = raw_title.split("/")[-1] if "/" in raw_title else raw_title
            clean_title = re.sub(r"^file_[a-f0-9]+_", "", clean_title, flags=re.IGNORECASE)

            raw_ref = item.source_locator or ""
            if raw_ref.startswith("http://") or raw_ref.startswith("https://"):
                clean_ref = raw_ref
            else:
                clean_ref = raw_ref.split("/")[-1] if "/" in raw_ref else raw_ref
                clean_ref = re.sub(r"^file_[a-f0-9]+_", "", clean_ref, flags=re.IGNORECASE)

            preview_txt = meta.get("preview_excerpt", meta.get("raw_text", ""))
            if preview_txt and isinstance(preview_txt, str):
                # Read-time safety net — sanitise font-encoding artefacts
                # and control chars for records written before write-time
                # sanitisation was deployed.  Idempotent, so double-cleaning
                # records that were already sanitised at write-time is harmless.
                preview_txt = sanitize_extracted_text(preview_txt)

            source_assets = dict(meta.get("assets") or {})
            if (not source_assets.get("images") or not source_assets.get("links")) and preview_txt:
                from app.yullo.services.sources.asset_extractor import extract_markdown_assets
                md_assets = extract_markdown_assets(preview_txt, item.source_locator or "")
                if md_assets.get("images") and not source_assets.get("images"):
                    source_assets["images"] = md_assets["images"]
                if md_assets.get("links") and not source_assets.get("links"):
                    source_assets["links"] = md_assets["links"]
                if md_assets.get("documents") and not source_assets.get("documents"):
                    source_assets["documents"] = md_assets["documents"]

            sources.append(SpaceSourceResponse(
                id=item.id,
                source_type=item.item_type,
                content_ref=clean_ref,
                status=status_val,
                title=clean_title,
                facts=item.extracted_facts or [],
                target_badges=meta.get("target_badges", ["About", "Category", "Aura knowledge"]),
                preview_excerpt=preview_txt,
                page_count=meta.get("page_count"),
                chunk_count=meta.get("chunk_count"),
                is_confirmed=meta.get("is_confirmed", False),
                is_scanned=meta.get("is_scanned", False),
                prompt_version=meta.get("prompt_version", "v1"),
                source_version=item.source_version or 1,
                error_msg=error_msg,
                progress=latest_job.progress if latest_job else None,
                stage=latest_job.stage_detail if latest_job else None,
                eta_seconds=latest_job.eta_seconds if latest_job else None,
                fact_extraction_status=meta.get("fact_extraction_status"),
                fact_extraction_error=meta.get("fact_extraction_error"),
                entity_extraction_status=meta.get("entity_extraction_status"),
                entity_extraction_error=meta.get("entity_extraction_error"),
                favicon_url=meta.get("favicon_url") or (source_assets.get("favicon_url") if isinstance(source_assets, dict) else None),
                preview_image_url=meta.get("preview_image_url") or (source_assets.get("preview_image_url") if isinstance(source_assets, dict) else None) or (source_assets.get("images", [{}])[0].get("url") if source_assets.get("images") else None),
                assets=source_assets,
                created_at=item.created_at
            ))
            
        return sources

    async def get_source(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        source_id: UUID,
    ) -> SpaceSourceResponse:
        item = await db.scalar(select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == source_id))
        if not item:
            raise HTTPException(status_code=404, detail="Source not found")
        owned_space = await db.scalar(select(Space.id).where(
            Space.id == item.space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        ))
        if not owned_space:
            raise HTTPException(status_code=403, detail="Not authorized to access this source")
        sources = await self.get_space_sources(db, item.space_id)
        source = next((candidate for candidate in sources if candidate.id == source_id), None)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        return source

    async def set_source_confirmation(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        source_id: UUID,
        is_confirmed: bool,
    ) -> UUID | None:
        """Enable/disable a source and queue full ingestion when it is enabled."""
        item = await db.scalar(
            select(KnowledgeBaseItem)
            .join(Space, Space.id == KnowledgeBaseItem.space_id)
            .where(
                KnowledgeBaseItem.id == source_id,
                Space.owner_user_id == user_id,
                Space.product == "yullo",
            )
            .with_for_update(of=KnowledgeBaseItem)
        )
        if not item:
            raise HTTPException(status_code=404, detail="Source not found")

        metadata = dict(item.source_metadata or {})
        was_confirmed = bool(metadata.get("is_confirmed", False))
        metadata["is_confirmed"] = is_confirmed
        item.source_metadata = metadata

        if is_confirmed:
            if was_confirmed and item.ingestion_status in ("queued", "processing", "ready"):
                return None

            # URL previews prepare a durable job without dispatching it. Reuse
            # that exact job after confirmation instead of creating a duplicate.
            pending_jobs = (await db.execute(select(IngestionJob).where(
                IngestionJob.kb_item_id == item.id,
                IngestionJob.status.in_(("pending_confirm", "awaiting_confirmation", "queued")),
            ).order_by(IngestionJob.created_at.desc()))).scalars().all()

            item.ingestion_status = "queued"
            if pending_jobs:
                reusable_job = pending_jobs[0]
                reusable_job.status = "queued"
                reusable_job.progress = 0
                reusable_job.eta_seconds = None
                reusable_job.stage_detail = "Queued"
                reusable_job.dispatch_attempts = 0
                reusable_job.dispatch_after = datetime.utcnow()
                for duplicate_job in pending_jobs[1:]:
                    duplicate_job.status = "cancelled"
                return reusable_job.id

            accepted = await self.retry_source(
                db,
                user_id=user_id,
                space_id=item.space_id,
                item_id=item.id,
                idempotency_key=uuid.uuid4(),
            )
            return accepted.job_id

        # Stopping a source immediately removes its extracted entities from the
        # public page. The indexed source and provenance remain available for a
        # future resume/review operation.
        from app.models.yullo_space_entity import YulloSpaceEntity, YulloSpaceEntityEvidence

        affected_ids = (await db.execute(select(YulloSpaceEntityEvidence.entity_id).where(
            YulloSpaceEntityEvidence.space_id == item.space_id,
            YulloSpaceEntityEvidence.source_item_id == item.id,
        ).distinct())).scalars().all()
        if affected_ids:
            entities = (await db.execute(select(YulloSpaceEntity).where(
                YulloSpaceEntity.space_id == item.space_id,
                YulloSpaceEntity.id.in_(affected_ids),
                YulloSpaceEntity.origin_type == "extracted",
            ))).scalars().all()
            for entity in entities:
                if entity.is_public:
                    entity.is_public = False
                    entity.revision += 1

        yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == item.space_id))
        if yullo_space:
            yullo_space.context_version += 1
        return None

    async def delete_source(self, db: AsyncSession, *, user_id: UUID, space_id: Optional[UUID], source_id: UUID) -> None:
        """
        Delete a source, purge vector chunks from vector storage, deactivate extracted entities,
        and remove the KnowledgeBaseItem.
        """
        stmt = select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == source_id)
        item = await db.scalar(stmt)
        if not item:
            raise HTTPException(status_code=404, detail="Source not found")
            
        space_stmt = select(Space).where(Space.id == item.space_id, Space.owner_user_id == user_id)
        space = await db.scalar(space_stmt)
        if not space:
            raise HTTPException(status_code=403, detail="Not authorized to modify this space")
            
        # 1. Purge vector chunks from vector store
        doc_id_to_delete = item.indexed_doc_id or item.doc_id
        if doc_id_to_delete:
            try:
                from app.rag.vector_store import get_vector_store
                get_vector_store().delete_doc(str(item.space_id), doc_id_to_delete)
            except Exception as vec_err:
                logger.warning(f"Failed to delete vector chunks for item {source_id}: {vec_err}")
                
        # 1.5 Purge original blob file from storage
        if item.source_locator and item.item_type != "url":
            try:
                from app.orchestra.ai.ingestion.storage import delete as storage_delete
                await storage_delete(item.source_locator)
            except Exception as blob_err:
                logger.warning(f"Failed to delete original blob for item {source_id}: {blob_err}")
                
        # 1.6 Purge extracted text blob if present
        meta = item.source_metadata or {}
        extracted_text_blob = meta.get("extracted_text_blob_key")
        if extracted_text_blob:
            try:
                from app.orchestra.ai.ingestion.storage import delete as storage_delete
                # Handle old paths that might not have space_id prefix in the key
                if "/" not in extracted_text_blob:
                    extracted_text_blob = f"{item.space_id}/{extracted_text_blob}"
                await storage_delete(extracted_text_blob)
            except Exception as blob_err:
                logger.warning(f"Failed to delete extracted text blob for item {source_id}: {blob_err}")

        # 2. Deactivate entities whose provenance traces back to this source.
        #    The source_item_id link lives on YulloSpaceEntityEvidence (the
        #    provenance table), not on YulloSpaceEntity itself.  Find affected
        #    entity IDs via evidence, then mark those entities inactive.
        from app.models.yullo_space_entity import YulloSpaceEntity, YulloSpaceEntityEvidence
        evidence_stmt = select(YulloSpaceEntityEvidence.entity_id).where(
            and_(
                YulloSpaceEntityEvidence.space_id == item.space_id,
                YulloSpaceEntityEvidence.source_item_id == item.id,
            )
        ).distinct()
        affected_entity_ids = (await db.execute(evidence_stmt)).scalars().all()

        if affected_entity_ids:
            entity_stmt = select(YulloSpaceEntity).where(
                and_(
                    YulloSpaceEntity.space_id == item.space_id,
                    YulloSpaceEntity.id.in_(affected_entity_ids),
                )
            )
            entities = (await db.execute(entity_stmt)).scalars().all()
            for ent in entities:
                ent.is_active = False
                ent.review_status = "superseded"
            
        await db.delete(item)
        
        yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == item.space_id))
        if yullo_space:
            yullo_space.context_version += 1
            db.add(yullo_space)
            
        await db.commit()

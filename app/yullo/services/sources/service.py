import asyncio
import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ingestion_job import IngestionJob
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.kb_fact import KBFact
from app.models.yullo_config import YulloConfig
from app.models.yullo_space import YulloSpace
from app.models.space import Space
from app.orchestra.ai.ingestion.storage import put as storage_put
from app.orchestra.ai.ingestion.core.text_utils import sanitize_extracted_text
from app.yullo.services.sources.resources import resource_state, resource_settings
from app.yullo.services.sources.contracts import SourceInput, SourceAccepted, TextSourceInput, UrlSourceInput, FileSourceInput
from app.schemas.yullo_onboarding import SpaceSourceResponse
from app.orchestra.ai.db_utils.source_loader import source_chunks_enabled

logger = logging.getLogger(__name__)


def public_source_asset(asset):
    """Disclosure policy shared by source images and their associated links."""
    return (isinstance(asset, dict)
            and asset.get('visibility', 'public') in ('public', 'public_aura')
            and asset.get('disclosure_mode', 'direct') == 'direct')


def source_images(source, *, config=None):
    """Authorize active indexed source evidence without a fact-approval gate."""
    from app.orchestra.ai.db_utils.source_loader import active_chunk_doc_id
    if not active_chunk_doc_id(source):
        return []
    metadata = source.source_metadata or {}
    if metadata.get('visibility', 'public') not in ('public', 'public_aura'):
        return []
    if metadata.get('disclosure_mode', 'direct') != 'direct':
        return []
    from app.yullo.config.inference import get_chat_image_config
    from app.orchestra.ai.knowledge.retrieval.images_retrieval import build_source_images

    return build_source_images(source, config=config if config is not None else get_chat_image_config(),
                               asset_visible=public_source_asset)


class SourceService:
    async def record_source_index(
        self, db: AsyncSession, *, user_id: UUID, space_id: UUID, source_id: UUID,
        source_version: int, doc_id: str, chunk_count: int, page_count: int,
        job_id: UUID | None = None, lease_token: UUID | None = None,
    ) -> bool:
        """Make a completed index active without approving any extracted facts."""
        if (type(source_version) is not int or source_version < 1
            or type(chunk_count) is not int or chunk_count < 1
            or type(page_count) is not int or page_count < 1
            or doc_id not in (f'knowledge:{source_id}:v{source_version}', f'preview:{source_id}:v{source_version}')):
            raise ValueError('Invalid source index result')
        conditions = [
            KnowledgeBaseItem.id == source_id, KnowledgeBaseItem.space_id == space_id,
            Space.owner_user_id == user_id, Space.product == 'yullo',
        ]
        if job_id is not None:
            conditions.append(select(IngestionJob.id).where(
                IngestionJob.id == job_id, IngestionJob.kb_item_id == source_id,
                IngestionJob.space_id == space_id, IngestionJob.source_version == source_version,
                IngestionJob.lease_token == lease_token, IngestionJob.status == 'running',
            ).exists())
        item = await db.scalar(select(KnowledgeBaseItem).join(Space, Space.id == KnowledgeBaseItem.space_id)
                               .where(*conditions).with_for_update(of=KnowledgeBaseItem)
                               .execution_options(populate_existing=True))
        if not item or (item.source_version or 1) != source_version:
            return False
        metadata = dict(item.source_metadata or {})
        enabled = source_chunks_enabled(item)
        metadata.update(indexing_status='done', indexed_source_version=source_version,
                        chunk_count=chunk_count, page_count=page_count,
                        chunks_enabled=enabled, is_confirmed=enabled)
        item.indexed_doc_id = doc_id
        item.published_version = source_version
        item.source_metadata = metadata
        await db.execute(update(YulloSpace).where(YulloSpace.space_id == space_id)
                         .values(context_version=YulloSpace.context_version + 1))
        await db.commit()
        return True

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
                
            # Refresh timestamps so current retry reflects current execution time
            now_utc = datetime.utcnow()
            existing_job.created_at = now_utc
            existing_job.updated_at = now_utc
            db.add(existing_job)

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
        sharing = await resource_settings(db, space_id)
        
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

            # Check if job is stale (no updates for >15 minutes)
            is_stale_job = False
            if latest_job and job_status in ('running', 'queued'):
                cutoff = datetime.utcnow() - timedelta(minutes=15)
                job_time = latest_job.updated_at or latest_job.created_at
                if job_time and job_time < cutoff:
                    is_stale_job = True

            if status_val in ('ready', 'ready_to_review'):
                # Item extraction is already completed and reviewable.
                # Do not let an abandoned or orphaned running job drag it back to running.
                if latest_job and job_status == 'running':
                    latest_job.status = 'done'
                    latest_job.progress = 100
                    latest_job.stage_detail = 'Finalizing'
                    db.add(latest_job)
            elif is_stale_job:
                status_val = 'failed'
                error_msg = error_msg or "Processing interrupted. Click Retry to re-run."
                latest_job.status = 'failed'
                latest_job.error = error_msg
                db.add(latest_job)
            elif latest_job and job_status == 'queued':
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
                from app.orchestra.ai.ingestion.scraper.asset_extractor import extract_markdown_assets
                md_assets = extract_markdown_assets(preview_txt, item.source_locator or "")
                if md_assets.get("images") and not source_assets.get("images"):
                    source_assets["images"] = md_assets["images"]
                if md_assets.get("links") and not source_assets.get("links"):
                    source_assets["links"] = md_assets["links"]
                if md_assets.get("documents") and not source_assets.get("documents"):
                    source_assets["documents"] = md_assets["documents"]
                if md_assets.get("link_categories") and not source_assets.get("link_categories"):
                    source_assets["link_categories"] = md_assets["link_categories"]

            if source_assets.get("links") and not source_assets.get("link_categories"):
                from app.orchestra.ai.ingestion.scraper.asset_extractor import _build_link_categories
                source_assets["link_categories"] = _build_link_categories(source_assets["links"])

            sources.append(SpaceSourceResponse(
                **resource_state(item, sharing.get(item.id)),
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
                is_confirmed=source_chunks_enabled(item),
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
        """Pause/resume a source without approving facts or rerunning ingestion."""
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
        metadata['chunks_enabled'] = is_confirmed
        metadata["is_confirmed"] = is_confirmed
        item.source_metadata = metadata

        if is_confirmed:
            await db.execute(update(YulloSpace).where(YulloSpace.space_id == item.space_id)
                             .values(context_version=YulloSpace.context_version + 1))
            return None

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

    async def get_deletion_impact(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        source_id: UUID,
    ) -> dict:
        item = await db.scalar(select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == source_id))
        if not item:
            raise HTTPException(status_code=404, detail="Source not found")
        space = await db.scalar(
            select(Space).where(
                Space.id == item.space_id,
                Space.owner_user_id == user_id,
                Space.product == "yullo",
            )
        )
        if not space:
            raise HTTPException(status_code=404, detail="Source not found")

        from app.models.yullo_space_entity import YulloSpaceEntityEvidence

        facts = (
            await db.scalars(select(KBFact.id).where(KBFact.source_item_id == item.id))
        ).all()
        affected_ids = set((await db.scalars(
            select(YulloSpaceEntityEvidence.entity_id).where(
                YulloSpaceEntityEvidence.space_id == item.space_id,
                YulloSpaceEntityEvidence.source_item_id == item.id,
            )
        )).all())
        other_supported_ids = set((await db.scalars(
            select(YulloSpaceEntityEvidence.entity_id).where(
                YulloSpaceEntityEvidence.space_id == item.space_id,
                YulloSpaceEntityEvidence.entity_id.in_(affected_ids),
                YulloSpaceEntityEvidence.source_item_id != item.id,
            )
        )).all()) if affected_ids else set()
        metadata = item.source_metadata or {}
        stored_artifacts = sum(bool(value) for value in (
            item.source_locator if item.item_type != "url" else None,
            metadata.get("extracted_text_blob_key"),
            metadata.get("raw_html_path"),
            metadata.get("raw_deep_path"),
        ))
        return {
            "source_id": str(item.id),
            "source_title": item.title or item.source_locator or "Untitled source",
            "source_version": item.source_version or 1,
            "facts": len(facts),
            "entities_source_only": len(affected_ids - other_supported_ids),
            "entities_with_other_evidence": len(affected_ids & other_supported_ids),
            "vector_chunks": int(metadata.get("chunk_count") or 0),
            "stored_artifacts": stored_artifacts,
        }

    @staticmethod
    def _delete_snapshot(path_value: str | None, *, space_id: UUID, source_id: UUID) -> None:
        if not path_value:
            return
        candidate = Path(path_value).resolve()
        allowed_root = (Path.cwd() / "uploads" / "links").resolve()
        try:
            candidate.relative_to(allowed_root)
        except ValueError:
            raise ValueError("Snapshot path is outside the managed links directory")
        if str(space_id) not in candidate.parts or str(source_id) not in candidate.parts:
            raise ValueError("Snapshot path does not match its Space and source")
        candidate.unlink(missing_ok=True)

    async def delete_source(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        space_id: Optional[UUID],
        source_id: UUID,
        derived_data: str = "purge",
        expected_source_version: int | None = None,
    ) -> dict:
        """
        Delete a source, purge vector chunks from vector storage, deactivate extracted entities,
        and remove the KnowledgeBaseItem.
        """
        if derived_data not in {"purge", "retain_for_review"}:
            raise HTTPException(status_code=400, detail="Invalid derived-data mode")
        stmt = select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == source_id).with_for_update()
        item = await db.scalar(stmt)
        if not item:
            raise HTTPException(status_code=404, detail="Source not found")
            
        space_stmt = select(Space).where(
            Space.id == item.space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        )
        space = await db.scalar(space_stmt)
        if not space:
            raise HTTPException(status_code=404, detail="Source not found")
        if space_id is not None and item.space_id != space_id:
            raise HTTPException(status_code=404, detail="Source not found")
        if expected_source_version is not None and (item.source_version or 1) != expected_source_version:
            raise HTTPException(status_code=409, detail="Source changed; refresh and try again")

        cleanup_errors: list[str] = []

        # Revoke every source job, including old retries, before its parent and
        # job rows cascade away. Workers also watch committed source deletion.
        jobs = (await db.scalars(select(IngestionJob).where(
            IngestionJob.kb_item_id == item.id,
            IngestionJob.space_id == item.space_id,
        ))).all()
        doc_ids = {item.indexed_doc_id, item.doc_id}
        for job in jobs:
            doc_ids.add(job.doc_id)
            if job.source_version is not None:
                doc_ids.add(f'knowledge:{item.id}:v{job.source_version}')
                doc_ids.add(f'preview:{item.id}:v{job.source_version}')
        doc_ids.add(f'preview:{item.id}:v{item.source_version or 1}')
        for job in jobs:
            if not job.is_terminal:
                job.status = 'cancelled'
                job.lease_token = None
                job.lease_expires_at = None
                job.stage_detail = 'Source removed'
            
        # 1. Purge vector chunks from vector store
        for doc_id_to_delete in sorted(doc_id for doc_id in doc_ids if doc_id):
            try:
                from app.orchestra.ai.knowledge.vector_store import get_vector_store
                await asyncio.to_thread(get_vector_store().delete_client_doc, str(item.space_id), doc_id_to_delete)
            except Exception as vec_err:
                cleanup_errors.append("vector_chunks")
                logger.warning("Failed to delete vector chunks for item %s: %s", source_id, vec_err)
                
        # 1.5 Purge original blob file from storage
        if item.source_locator and item.item_type != "url":
            try:
                from app.orchestra.ai.ingestion.storage import delete as storage_delete
                await storage_delete(item.source_locator)
            except Exception as blob_err:
                cleanup_errors.append("source_blob")
                logger.warning("Failed to delete original blob for item %s: %s", source_id, blob_err)
                
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
                cleanup_errors.append("extracted_text")
                logger.warning("Failed to delete extracted text blob for item %s: %s", source_id, blob_err)

        for metadata_key in ("raw_html_path", "raw_deep_path"):
            try:
                self._delete_snapshot(meta.get(metadata_key), space_id=item.space_id, source_id=item.id)
            except Exception as snapshot_err:
                cleanup_errors.append(metadata_key)
                logger.warning("Failed to delete %s for item %s: %s", metadata_key, source_id, snapshot_err)

        try:
            from app.orchestra.ai.ingestion.cancellation import delete_source_snapshots
            await asyncio.to_thread(delete_source_snapshots, space_id=item.space_id, source_id=item.id)
        except Exception as snapshot_err:
            cleanup_errors.append('source_snapshots')
            logger.warning('source.snapshot_cleanup_failed source_id=%s error_type=%s',
                           source_id, type(snapshot_err).__name__)

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

        source_only_entity_ids: list[UUID] = []
        if affected_entity_ids:
            other_evidence_ids = set((await db.scalars(
                select(YulloSpaceEntityEvidence.entity_id).where(
                    YulloSpaceEntityEvidence.space_id == item.space_id,
                    YulloSpaceEntityEvidence.entity_id.in_(affected_entity_ids),
                    YulloSpaceEntityEvidence.source_item_id != item.id,
                )
            )).all())
            entity_stmt = select(YulloSpaceEntity).where(
                and_(
                    YulloSpaceEntity.space_id == item.space_id,
                    YulloSpaceEntity.id.in_(affected_entity_ids),
                )
            )
            entities = (await db.execute(entity_stmt)).scalars().all()
            for ent in entities:
                if ent.origin_type != "extracted" or ent.id in other_evidence_ids:
                    continue
                source_only_entity_ids.append(ent.id)
                if derived_data == "purge":
                    await db.delete(ent)
                else:
                    ent.is_active = False
                    ent.is_public = False
                    ent.review_status = "superseded"
                    ent.revision += 1

        facts = (await db.scalars(select(KBFact).where(
            KBFact.space_id == item.space_id,
            KBFact.source_item_id == item.id,
        ))).all()
        retained_fact_ids: list[str] = []
        if derived_data == "purge":
            for fact in facts:
                await db.delete(fact)
        else:
            for fact in facts:
                fact.source_item_id = None
                fact.deleted_source_id = item.id
                fact.deleted_source_locator = item.source_locator
                fact.maintenance_mode = "review_required"
                fact.review_status = "extracted"
                fact.verified = False
                retained_fact_ids.append(str(fact.id))
            if retained_fact_ids or source_only_entity_ids:
                from app.models.yullo_knowledge_cleanup_alert import YulloKnowledgeCleanupAlert

                db.add(YulloKnowledgeCleanupAlert(
                    space_id=item.space_id,
                    deleted_source_id=item.id,
                    source_title=item.title or item.source_locator or "Untitled source",
                    source_locator=item.source_locator,
                    fact_ids=retained_fact_ids,
                    entity_ids=[str(entity_id) for entity_id in source_only_entity_ids],
                ))

        # Detach retained facts before deleting the source so the database FK
        # cannot cascade them. Evidence rows still cascade from the source.
        await db.flush()

        from app.models.yullo_source import YulloSource

        legacy_sources = (await db.scalars(select(YulloSource).where(
            YulloSource.space_id == item.space_id,
            YulloSource.kb_item_id == item.id,
        ))).all()
        for legacy_source in legacy_sources:
            await db.delete(legacy_source)

        await db.delete(item)
        
        yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == item.space_id))
        if yullo_space:
            yullo_space.context_version += 1
            db.add(yullo_space)
            
        await db.commit()
        logger.info('source.deleted space_id=%s source_id=%s jobs_cancelled=%s cleanup=%s',
                    item.space_id, source_id, len(jobs), 'pending_retry' if cleanup_errors else 'complete')
        return {
            "ok": True,
            "cleanup": "pending_retry" if cleanup_errors else "complete",
            "cleanup_failures": cleanup_errors,
            "review_created": bool(retained_fact_ids or source_only_entity_ids),
        }


async def load_chat_sources(db, context, *, refresh=False):
    """Resolve current Space/KB/publication scope for retrieval and expansion."""
    from app.orchestra.ai.db_utils.source_loader import (
        resolve_space_kb_ids, load_published_chat_sources, active_chunk_doc_id,
    )
    authorized = await resolve_space_kb_ids(db, context.space_id, product='yullo')
    kb_ids = [key for key in authorized if not context.kb_ids or key in context.kb_ids]
    items = await load_published_chat_sources(db, context.space_id, kb_ids, product='yullo', refresh=refresh)
    from app.yullo.services.sources.assets import load_registered_source_assets
    sources = {
        doc_id: item for item in items
        if (doc_id := active_chunk_doc_id(item))
        and (item.source_metadata or {}).get('visibility', 'public') in ('public', 'public_aura')
        and (item.source_metadata or {}).get('disclosure_mode', 'direct') == 'direct'
    }
    return kb_ids, await load_registered_source_assets(db, sources)

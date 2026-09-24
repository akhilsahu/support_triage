import hashlib
import json
import logging
from datetime import datetime
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
from app.yullo.services.sources.contracts import SourceInput, SourceAccepted, TextSourceInput, UrlSourceInput, FileSourceInput
from app.schemas.yullo_onboarding import SpaceSourceResponse

logger = logging.getLogger(__name__)


class SourceService:
    @staticmethod
    async def _resolve_primary_kb(db: AsyncSession, space_id: UUID) -> UUID:
        """
        Resolve or create the primary knowledge base for the Yullo Space.
        Assumes the YulloSpace is already locked by the caller.
        """
        # Fetch config
        stmt = select(YulloConfig).where(YulloConfig.space_id == space_id)
        config = await db.scalar(stmt)
        if not config:
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
                status="queued"
            )

        # 4. Insert KnowledgeBaseItem
        title = command.title if hasattr(command, 'title') else command.url
        new_item = KnowledgeBaseItem(
            space_id=space_id,
            kb_id=primary_kb_id,
            title=title,
            ingestion_status="queued",
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
            status="QUEUED",
            retry_payload=retry_payload,
            dispatch_attempts=0
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
            status="queued"
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
            status="QUEUED",
            retry_payload=retry_payload,
            dispatch_attempts=0
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
        primary_kb_id = await self._resolve_primary_kb(db, space_id)
        
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
            if latest_job and latest_job.status == 'FAILED':
                error_msg = latest_job.error
                
            status_val = item.ingestion_status
            if latest_job and latest_job.status == 'QUEUED':
                status_val = 'queued'
            elif latest_job and latest_job.status == 'RUNNING':
                status_val = 'running'
                
            meta = item.source_metadata or {}
            sources.append(SpaceSourceResponse(
                id=item.id,
                source_type=item.item_type,
                content_ref=item.source_locator or "",
                status=meta.get("status", status_val),
                title=item.title or item.source_locator,
                facts=item.extracted_facts or [],
                target_badges=meta.get("target_badges", ["About", "Category", "Aura knowledge"]),
                raw_text=meta.get("raw_text", ""),
                is_confirmed=meta.get("is_confirmed", False),
                prompt_version=meta.get("prompt_version", "v1"),
                source_version=item.source_version or 1,
                error_msg=error_msg,
                created_at=item.created_at
            ))
            
        return sources

    async def delete_source(self, db: AsyncSession, *, user_id: UUID, space_id: Optional[UUID], source_id: UUID) -> None:
        """
        Delete a source and logically remove it from the KB.
        """
        stmt = select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == source_id)
        item = await db.scalar(stmt)
        if not item:
            raise HTTPException(status_code=404, detail="Source not found")
            
        space_stmt = select(Space).where(Space.id == item.space_id, Space.owner_user_id == user_id)
        space = await db.scalar(space_stmt)
        if not space:
            raise HTTPException(status_code=403, detail="Not authorized to modify this space")
            
        await db.delete(item)
        
        yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == item.space_id))
        if yullo_space:
            yullo_space.context_version += 1
            db.add(yullo_space)
            
        await db.commit()

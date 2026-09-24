import uuid
from pathlib import Path
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion_job import IngestionJob
from app.models.yullo_source import YulloSource
from app.orchestra.ai.ingestion.scraper import fetch_url
from app.orchestra.ai.ingestion.jobs import get_job_runner
import hashlib

class YulloIngestionAdapter:
    def __init__(self, db: AsyncSession):
        self.db = db
        
    def _create_temp_file(self, content: bytes, filename: str) -> Path:
        tmp_dir = Path("uploads").absolute()
        tmp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = tmp_dir / f"{uuid.uuid4().hex}_{Path(filename).name}"
        temp_path.write_bytes(content)
        return temp_path

    async def enqueue_text(self, space_id: uuid.UUID, text: str, metadata: dict = None) -> YulloSource:
        content_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()
        
        filename = (metadata or {}).get("filename", "pasted.txt")
        temp_path = self._create_temp_file(text.encode('utf-8'), filename)
        
        job = IngestionJob(
            space_id=space_id,
            filename=filename,
            doc_type="general",
            source="file",
            status="queued",
            progress=0,
            stage_detail="Waiting to start",
        )
        self.db.add(job)
        await self.db.flush()
        
        metadata = metadata or {}
        metadata["status"] = "queued"
        
        source = YulloSource(
            space_id=space_id,
            type="text",
            ingestion_job_id=job.id,
            content_hash=content_hash,
            metadata_json=metadata
        )
        self.db.add(source)
        await self.db.flush()
        
        # Enqueue actual processing
        task_kwargs = dict(
            job_id=str(job.id),
            space_id=str(space_id),
            temp_path=str(temp_path),
            filename=filename,
            display_name=filename,
            topic=None,
            doc_label=None,
            description=None,
            url=None,
            context_enriched=False
        )
        job.retry_payload = task_kwargs
        await self.db.flush()
        
        get_job_runner().enqueue("ingest_document", **task_kwargs)
        
        return source
        
    async def enqueue_url(self, space_id: uuid.UUID, url: str) -> YulloSource:
        # We need to fetch the URL to get the content
        page = await fetch_url(url, mode="quick")
        
        content_hash = hashlib.sha256(page.raw).hexdigest()
        
        display_name = page.title if page.title else url
        temp_path = self._create_temp_file(page.raw, page.filename)
        
        job = IngestionJob(
            space_id=space_id,
            filename=display_name,
            doc_type="general",
            source="url",
            status="queued",
            progress=0,
            stage_detail="Waiting to start",
        )
        self.db.add(job)
        await self.db.flush()
        
        source = YulloSource(
            space_id=space_id,
            type="website",
            ingestion_job_id=job.id,
            content_hash=content_hash,
            metadata_json={"content_ref": url, "status": "queued"}
        )
        self.db.add(source)
        await self.db.flush()
        
        task_kwargs = dict(
            job_id=str(job.id),
            space_id=str(space_id),
            temp_path=str(temp_path),
            filename=page.filename,
            display_name=display_name,
            topic=None,
            doc_label=None,
            description=None,
            url=url,
            context_enriched=False
        )
        job.retry_payload = task_kwargs
        await self.db.flush()
        
        get_job_runner().enqueue("ingest_document", **task_kwargs)
        
        return source

    async def get_status(self, source_id: uuid.UUID) -> dict:
        source = await self.db.get(YulloSource, source_id)
        if not source:
            return None
            
        status = "queued"
        if source.ingestion_job_id:
            job = await self.db.get(IngestionJob, source.ingestion_job_id)
            if job:
                status = job.status
                
        return {
            "status": status,
            "metadata": source.metadata_json
        }
        
    async def remove_source(self, source_id: uuid.UUID):
        source = await self.db.get(YulloSource, source_id)
        if not source:
            return
            
        if source.ingestion_job_id:
            # We can't cancel the job easily but we delete the row
            job = await self.db.get(IngestionJob, source.ingestion_job_id)
            if job:
                await self.db.delete(job)
                
        await self.db.delete(source)
        await self.db.flush()

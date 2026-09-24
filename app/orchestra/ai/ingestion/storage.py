import os
import aiofiles
import logging
from pathlib import Path
from typing import AsyncContextManager
from contextlib import asynccontextmanager
from uuid import UUID

from app.config import settings

logger = logging.getLogger(__name__)

# Base directory for local blob storage. Should not be the public uploads tree.
LOCAL_STORAGE_BASE = Path(settings.DATA_DIR) / "yullo_source_blobs" if hasattr(settings, "DATA_DIR") else Path("/tmp/yullo_source_blobs")

class LocalSourceBlobStore:
    def __init__(self, base_dir: Path = LOCAL_STORAGE_BASE):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        
    async def put(self, *, space_id: UUID, key: str, body: bytes, content_type: str) -> str:
        """
        Store bytes durably before database transaction.
        Returns the blob_key which can be used to materialize later.
        """
        blob_key = f"{space_id}/{key}"
        file_path = self.base_dir / blob_key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(file_path, mode='wb') as f:
            await f.write(body)
            
        logger.info(f"Stored blob {blob_key} ({len(body)} bytes, {content_type})")
        return blob_key

    @asynccontextmanager
    async def materialize(self, blob_key: str) -> AsyncContextManager[Path]:
        """
        Materialize blob key to a local filesystem path. 
        For local storage, it yields the existing path directly.
        """
        file_path = self.base_dir / blob_key
        if not file_path.exists():
            raise FileNotFoundError(f"Blob {blob_key} not found at {file_path}")
            
        # Yield the local path. Cloud storage implementations would download
        # to a temp file, yield it, and delete it in finally block.
        try:
            yield file_path
        finally:
            pass

# Default to local blob store for now
default_blob_store = LocalSourceBlobStore()

async def put(*, space_id: UUID, key: str, body: bytes, content_type: str) -> str:
    return await default_blob_store.put(space_id=space_id, key=key, body=body, content_type=content_type)
    
@asynccontextmanager
async def materialize(blob_key: str) -> AsyncContextManager[Path]:
    async with default_blob_store.materialize(blob_key) as path:
        yield path

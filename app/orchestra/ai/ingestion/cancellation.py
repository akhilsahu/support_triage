"""Stop deleted-source work across API/worker processes and clean late writes."""
from __future__ import annotations

import asyncio
import shutil
from contextlib import suppress
from contextvars import ContextVar
from pathlib import Path
from threading import Event
from uuid import UUID

import structlog
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.knowledge_base import KnowledgeBaseItem

logger = structlog.get_logger(__name__)
_cancelled: ContextVar[Event | None] = ContextVar('source_work_cancelled', default=None)


def check_source_cancellation() -> None:
    """Also usable from parser threads, whose context carries the same event."""
    signal = _cancelled.get()
    if signal is not None and signal.is_set():
        raise asyncio.CancelledError('Source work cancelled')


async def settle_write(awaitable):
    """Drain a non-interruptible write before cancellation cleanup can delete it."""
    write = asyncio.ensure_future(awaitable)
    try:
        return await asyncio.shield(write)
    except asyncio.CancelledError:
        # Cancelling an await does not kill the thread doing an embedding/upsert.
        # Wait for it so deletion cleanup cannot race a later persistent write.
        while not write.done():
            with suppress(Exception, asyncio.CancelledError):
                await asyncio.shield(write)
        with suppress(Exception, asyncio.CancelledError):
            write.result()
        raise


def delete_source_snapshots(*, space_id, source_id) -> None:
    """Include snapshots not yet recorded by an interrupted preview."""
    space_id, source_id = UUID(str(space_id)), UUID(str(source_id))
    root = Path.cwd() / 'uploads' / 'links' / str(space_id)
    if root.is_symlink():
        raise ValueError('Snapshot Space directory cannot be a symlink')
    root = root.resolve()
    for directory in root.glob(f'*/{source_id}'):
        if directory.is_symlink() or not directory.resolve().is_relative_to(root):
            raise ValueError('Snapshot directory is outside its source scope')
        try:
            shutil.rmtree(directory)
        except FileNotFoundError:
            pass  # Another cancelled attempt may already have cleaned it.


async def _source_exists(space_id: UUID, source_id: UUID) -> bool:
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(KnowledgeBaseItem.id).where(
            KnowledgeBaseItem.id == source_id,
            KnowledgeBaseItem.space_id == space_id,
        )) is not None


async def _cleanup_deleted_source(*, space_id: UUID, source_id: UUID, doc_ids: tuple[str, ...]):
    for doc_id in doc_ids:
        try:
            from app.orchestra.ai.knowledge.vector_store import get_vector_store
            await asyncio.to_thread(get_vector_store().delete_client_doc, str(space_id), doc_id)
        except Exception as error:
            logger.error('source.cancel_cleanup_failed', source_id=str(source_id),
                         artifact='vectors', error_type=type(error).__name__)
    try:
        await asyncio.to_thread(delete_source_snapshots, space_id=space_id, source_id=source_id)
    except Exception as error:
        logger.error('source.cancel_cleanup_failed', source_id=str(source_id),
                     artifact='snapshots', error_type=type(error).__name__)


async def run_source_work(work, *, space_id, source_id, doc_ids: tuple[str, ...] = ()):
    """Run one source operation; committed deletion is its durable cancel signal.

    Both in-process and Celery workers observe the same source row. No process
    termination is used, so other sources and product work remain independent.
    """
    space_id, source_id = UUID(str(space_id)), UUID(str(source_id))
    if not await _source_exists(space_id, source_id):
        return None
    signal = Event()
    token = _cancelled.set(signal)
    worker = asyncio.create_task(work())

    async def watch_deletion():
        while True:
            await asyncio.sleep(1)
            try:
                exists = await _source_exists(space_id, source_id)
            except Exception as error:
                logger.warning('source.cancel_check_failed', source_id=str(source_id),
                               error_type=type(error).__name__)
                continue
            if not exists:
                signal.set()
                return

    watcher = asyncio.create_task(watch_deletion())
    try:
        done, _ = await asyncio.wait((worker, watcher), return_when=asyncio.FIRST_COMPLETED)
        if worker in done:
            return await worker
        logger.info('source.work_cancelled', space_id=str(space_id), source_id=str(source_id),
                    reason='source_deleted')
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker
        return None
    finally:
        watcher.cancel()
        with suppress(asyncio.CancelledError):
            await watcher
        if not worker.done():
            signal.set()
            worker.cancel()
            with suppress(Exception, asyncio.CancelledError):
                await worker
        _cancelled.reset(token)
        try:
            deleted = not await _source_exists(space_id, source_id)
        except Exception as error:
            logger.warning('source.cancel_check_failed', source_id=str(source_id),
                           error_type=type(error).__name__)
        else:
            if deleted:
                await _cleanup_deleted_source(space_id=space_id, source_id=source_id, doc_ids=doc_ids)

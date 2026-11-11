"""Shared read-only Space/KB and published-source queries, explicitly product-scoped."""
from typing import Literal
from sqlalchemy import String, cast, select, or_, func, and_, not_
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.space import Space


def source_chunks_enabled(source):
    metadata = source.source_metadata or {}
    if 'chunks_enabled' in metadata:
        return metadata['chunks_enabled'] is not False
    # Legacy false meant either an unreviewed preview or an explicit pause.
    # A previously published source was explicitly paused; preserve that choice.
    return not (metadata.get('is_confirmed') is False and getattr(source, 'published_version', None) is not None)


def chunk_source_enabled_condition():
    metadata = KnowledgeBaseItem.source_metadata
    return func.coalesce(metadata['chunks_enabled'].as_boolean(), not_(and_(
        metadata['is_confirmed'].as_boolean().is_(False),
        KnowledgeBaseItem.published_version.is_not(None),
    )))


async def resolve_space_kb_ids(db, space_id, *, product: Literal["support247", "yullo"]):
    return list((await db.scalars(
        select(KnowledgeBase.id).join(Space, Space.id == KnowledgeBase.space_id).where(
            KnowledgeBase.space_id == space_id, KnowledgeBase.active.is_(True),
            Space.product == product, Space.active.is_(True),
        )
    )).all())


async def load_published_chat_sources(db, space_id, kb_ids, *, product: Literal["support247", "yullo"], refresh=False):
    if not kb_ids:
        return []
    conditions = [
        Space.product == product, Space.active.is_(True),
        KnowledgeBaseItem.space_id == space_id,
        KnowledgeBase.space_id == space_id,
        KnowledgeBase.active.is_(True),
        KnowledgeBaseItem.kb_id.in_(kb_ids),
    ]
    if product == 'yullo':
        # Chunk use is automatic; fact review is enforced by the fact reader.
        conditions.extend([
            or_(KnowledgeBaseItem.indexed_doc_id.is_not(None), KnowledgeBaseItem.published_version.is_not(None)),
            chunk_source_enabled_condition(),
        ])
    else:
        conditions.extend([
            KnowledgeBaseItem.ingestion_status == 'ready',
            KnowledgeBaseItem.published_version.is_not(None),
            KnowledgeBaseItem.published_version > 0,
            cast(KnowledgeBaseItem.source_metadata['is_confirmed'], String) == 'true',
        ])
    return list((await db.scalars(select(KnowledgeBaseItem).join(
        KnowledgeBase, KnowledgeBase.id == KnowledgeBaseItem.kb_id,
    ).join(Space, Space.id == KnowledgeBase.space_id).where(
        *conditions,
    ).execution_options(populate_existing=refresh))).all())


def published_doc_id(source):
    return getattr(source, 'indexed_doc_id', None) or f'knowledge:{source.id}:v{source.published_version}'


def active_chunk_doc_id(source):
    """Resolve a current indexed revision; legacy approval is not a chunk gate."""
    metadata = source.source_metadata or {}
    if not source_chunks_enabled(source):
        return None
    current = source.source_version or 1
    indexed_version = metadata.get('indexed_source_version') or source.published_version
    doc_id = getattr(source, 'indexed_doc_id', None)
    if indexed_version is not None:
        return published_doc_id(source) if indexed_version == current else None
    # Earlier private indexes used these versioned IDs without published_version.
    return doc_id if doc_id in (f'knowledge:{source.id}:v{current}', f'preview:{source.id}:v{current}') else None

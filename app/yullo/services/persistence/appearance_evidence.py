"""Appearance evidence reuses current Space retrieval and exact chunk reads."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import unicodedata
from collections import defaultdict

from app.orchestra.ai.db_utils.source_loader import active_chunk_doc_id
from app.yullo.schemas.retrieval import RetrievedContext, YulloExecutionContext

logger = logging.getLogger(__name__)


def chunk_reference_key(reference):
    if isinstance(reference, dict):
        return str(reference['sourceItemId']), reference['sourceVersion'], reference['chunkId']
    return str(reference.source_item_id), reference.source_version, reference.chunk_id


def existing_section_context(content, requested_section):
    """Other sections describe exclusions, never additional source evidence."""
    return [
        {"type": section.type.value, "heading": section.heading, "items": [
            {"title": item.title, "description": (item.description or '')[:80],
             "sourceEntityId": item.source_entity_id}
            for item in section.items
        ]}
        for section in content.sections if section.type != requested_section
    ]


def item_is_duplicate(item, others):
    def title(value):
        return re.sub(r'[\W_]+', '', unicodedata.normalize('NFKC', value).casefold())

    normalized = title(item.title)
    return any(
        (normalized and normalized == title(other.title))
        or (item.source_entity_id and item.source_entity_id == other.source_entity_id)
        for other in others
    )


def _chunk_index(reference, space_id, source):
    if not source or reference.source_version != (source.source_version or 1):
        return None
    doc_id = active_chunk_doc_id(source)
    prefix = f'{space_id}:{doc_id}:'
    suffix = reference.chunk_id.removeprefix(prefix)
    if doc_id and reference.chunk_id.startswith(prefix) and suffix.isascii() and suffix.isdigit() and len(suffix) <= 10:
        return int(suffix)
    return None


async def eligible_preview_chunks(db, *, space_id, contents):
    """Batch-check persisted references against current sources and actual chunk IDs."""
    references = {chunk_reference_key(ref): ref for content in contents if content
                  for section in content.sections for item in section.items for ref in item.source_chunks}
    if not references:
        return set()
    from app.yullo.services.sources.service import load_chat_sources

    _, sources = await load_chat_sources(db, YulloExecutionContext(space_id=space_id, kb_ids=[]), refresh=True)
    by_id = {str(source.id): source for source in sources.values()}
    groups = defaultdict(dict)
    for key, reference in references.items():
        source = by_id.get(str(reference.source_item_id))
        index = _chunk_index(reference, space_id, source)
        if index is not None:
            groups[active_chunk_doc_id(source)][index] = key
    valid = set()
    if not groups:
        return valid
    try:
        from app.orchestra.ai.knowledge.vector_store import get_vector_store
        store = get_vector_store()
        for doc_id, indices in groups.items():
            values = sorted(indices)
            for start in range(0, len(values), 20):
                rows = await asyncio.to_thread(store.get_chunks_by_indices, str(space_id), doc_id,
                                               values[start:start + 20], content=False)
                for row in rows:
                    meta = row['metadata']
                    if meta.get('doc_id') != doc_id or str(meta.get('client_id', meta.get('space_id', ''))) != str(space_id):
                        continue
                    for index in values[start:start + 20]:
                        if row['id'] == f'{space_id}:{doc_id}:{index}':
                            valid.add(indices[index])
    except Exception as error:
        logger.warning('yullo.appearance.chunk_check_unavailable', extra={
            'space_id': str(space_id), 'error_type': type(error).__name__,
        })
    return valid


async def retrieve_preview_passages(db, *, space_id, query, limit, max_characters):
    from app.orchestra.ai.config import build_config
    from app.orchestra.ai.knowledge.factory import build_knowledge_backend
    from app.orchestra.ai.knowledge.retrieval.retrieve_chunks import retrieve_passages, passage_context
    from app.orchestra.ai.ui_render.source_assets import SourceAssetReferences
    from app.yullo.services.sources.assets import hydrate_passage_assets
    from app.yullo.services.sources.service import load_chat_sources, public_source_asset

    context = YulloExecutionContext(space_id=space_id, kb_ids=[], is_preview=True)
    try:
        _, sources = await load_chat_sources(db, context, refresh=True)
        pack = RetrievedContext()
        backend = build_knowledge_backend(build_config())
        pack.retrieval_status = await retrieve_passages(backend, context, query, limit, sources, pack)
        hydrate_passage_assets(sources, pack.passages)
        compact = SourceAssetReferences()
        passages = []
        for passage in pack.passages:
            meta = passage['meta']
            source = sources.get(meta.get('doc_id'))
            index = meta.get('chunk_index')
            if not source or type(index) is not int or index < 0:
                continue
            payload = json.loads(compact.format_passage(
                passage, lambda value: passage_context(value, asset_visible=public_source_asset),
            ))
            # A bounded, explicitly marked excerpt retains the actual chunk reference.
            text = payload['content']
            payload['content'] = text[:max_characters]
            payload['isExcerpt'] = len(text) > max_characters
            payload['reference'] = {
                'sourceItemId': str(source.id), 'sourceVersion': source.source_version or 1,
                'chunkId': f'{space_id}:{meta["doc_id"]}:{index}',
            }
            passages.append(payload)
        logger.info('yullo.appearance.passages_retrieved', extra={
            'space_id': str(space_id), 'passages': len(passages), 'status': pack.retrieval_status,
        })
        return passages
    except Exception as error:
        logger.warning('yullo.appearance.retrieval_unavailable', extra={
            'space_id': str(space_id), 'error_type': type(error).__name__,
        })
        return []

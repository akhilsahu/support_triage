"""One persistence/hydration boundary for source link and image destinations."""
from __future__ import annotations

import hashlib
import html
import json
from types import SimpleNamespace
from urllib.parse import urljoin

import structlog
from sqlalchemy import select, delete, tuple_
from sqlalchemy.dialects.postgresql import insert

from app.models.knowledge_base import KnowledgeBaseItem
from app.models.knowledge_source_asset import KnowledgeSourceAsset
from app.models.space import Space
from app.models.ingestion_job import IngestionJob
from app.orchestra.ai.knowledge.retrieval.images_retrieval import safe_image_url

logger = structlog.get_logger()


def _destination(value, base):
    if not isinstance(value, str):
        return None
    # Preserve query ordering, signatures, variants and category filters.
    return safe_image_url(urljoin(base or '', html.unescape(value).strip()))


async def register_source_assets(db, prepared, *, user_id, space_id, source_id,
                                 source_version, job_id=None, lease_token=None):
    """Register a complete revision before indexing; caller owns the transaction."""
    if type(source_version) is not int or source_version < 1:
        raise ValueError('A positive source revision is required')
    conditions = [KnowledgeBaseItem.id == source_id, KnowledgeBaseItem.space_id == space_id,
                  Space.owner_user_id == user_id, Space.product == 'yullo']
    if job_id is not None:
        conditions.append(select(IngestionJob.id).where(
            IngestionJob.id == job_id, IngestionJob.kb_item_id == source_id,
            IngestionJob.space_id == space_id, IngestionJob.source_version == source_version,
            IngestionJob.lease_token == lease_token, IngestionJob.status == 'running',
        ).exists())
    source = await db.scalar(select(KnowledgeBaseItem).join(Space, Space.id == KnowledgeBaseItem.space_id)
                             .where(*conditions).with_for_update(of=KnowledgeBaseItem))
    if not source or (source.source_version or 1) != source_version:
        raise ValueError('Source revision is no longer active')
    rows = {}

    def destination_id(kind, value):
        url = _destination(value, source.source_locator)
        if not url:
            return None
        digest = hashlib.sha256(url.encode()).hexdigest()
        identifier = hashlib.sha256(f'{space_id}:{source_id}:{source_version}:{kind}:{digest}'.encode()).hexdigest()
        rows.setdefault(identifier, dict(
            id=identifier, space_id=space_id, source_item_id=source_id,
            source_kb_id=source.kb_id, source_version=source_version, kind=kind,
            url=url, url_hash=digest, metadata_json={'occurrences': []},
        ))
        return identifier

    source_inventory = (source.source_metadata or {}).get('assets') or {}
    if not isinstance(source_inventory, dict):
        source_inventory = {}
    for chunk in [*prepared.chunks, None]:
        refs = []
        for kind, field in (('link', 'links'), ('image', 'images')):
            assets = (chunk.metadata if chunk is not None else source_inventory).get(field) or []
            if chunk is not None and field not in chunk.metadata and kind == 'link':
                from app.orchestra.ai.ingestion.parsers.markdown_links import markdown_links
                assets = list(markdown_links(chunk.source_text or chunk.text))
            if not isinstance(assets, list):
                continue
            for asset in assets:
                if not isinstance(asset, dict):
                    continue
                identifier = destination_id(kind, asset.get('url'))
                if not identifier:
                    continue
                occurrence = {key: value for key, value in asset.items()
                              if key not in ('url', 'image_url', 'destination_url', 'href', 'link_url')
                              and value is not None and value != ''}
                occurrence.update(asset_id=identifier, kind=kind)
                if kind == 'image':
                    target = asset.get('destination_url') or asset.get('link_url') or asset.get('href')
                    if target_id := destination_id('link', target):
                        occurrence['destination_id'] = target_id
                elif image_id := destination_id('image', asset.get('image_url')):
                    occurrence['image_id'] = image_id
                if occurrence not in refs:
                    refs.append(occurrence)
                stored = {**occurrence, 'chunk_index': chunk.chunk_index if chunk is not None else None,
                          'heading_path': chunk.metadata.get('heading_path') or [] if chunk is not None else [],
                          'context_text': occurrence.get('context_text') or
                          (chunk.source_text or chunk.text if chunk is not None else '')}
                if stored not in rows[identifier]['metadata_json']['occurrences']:
                    rows[identifier]['metadata_json']['occurrences'].append(stored)
        if chunk is not None:
            chunk.metadata = {**chunk.metadata, 'asset_refs': refs, 'links': [], 'images': []}

    # Deterministic IDs and one upsert make retries idempotent. No capped inventory.
    values = list(rows.values())
    for start in range(0, len(values), 200):
        statement = insert(KnowledgeSourceAsset).values(values[start:start + 200])
        await db.execute(statement.on_conflict_do_update(
            index_elements=[KnowledgeSourceAsset.id],
            set_={'metadata_json': statement.excluded.metadata_json},
        ))
    await db.execute(delete(KnowledgeSourceAsset).where(
        KnowledgeSourceAsset.space_id == space_id, KnowledgeSourceAsset.source_item_id == source_id,
        KnowledgeSourceAsset.source_version == source_version,
        KnowledgeSourceAsset.id.not_in(list(rows)),
    ))
    source.source_metadata = {**(source.source_metadata or {}), 'asset_registry_version': source_version}
    await db.flush()
    logger.info('source.assets_registered', source_id=str(source_id), version=source_version,
                links=sum(row['kind'] == 'link' for row in values), images=sum(row['kind'] == 'image' for row in values))


def _hydrate_asset(ref, records):
    if not isinstance(ref.get('asset_id'), str):
        return None
    record = records.get(ref.get('asset_id'))
    if not record or record['kind'] != ref.get('kind'):
        return None
    result = {**ref, 'url': record['url']}
    for field, target in (('destination_id', 'destination_url'), ('image_id', 'image_url')):
        identifier = ref.get(field)
        linked = records.get(identifier) if isinstance(identifier, str) else None
        if linked and linked['kind'] == ('link' if field == 'destination_id' else 'image'):
            result[target] = linked['url']
    return result


async def load_registered_source_assets(db, sources):
    """Hydrate only already-authorized source revisions, using a single batch read."""
    registered = [source for source in sources.values()
                  if (source.source_metadata or {}).get('asset_registry_version') == (source.source_version or 1)]
    if not registered:
        return sources
    revisions = [(source.id, source.space_id, source.source_version or 1) for source in registered]
    assets = (await db.scalars(select(KnowledgeSourceAsset).where(
        tuple_(KnowledgeSourceAsset.source_item_id, KnowledgeSourceAsset.space_id,
               KnowledgeSourceAsset.source_version).in_(revisions),
    ))).all()
    by_source = {}
    for asset in assets:
        by_source.setdefault(asset.source_item_id, {})[asset.id] = dict(
            id=asset.id, kind=asset.kind, url=asset.url, metadata=asset.metadata_json,
        )
    result = dict(sources)
    for doc_id, source in sources.items():
        if source not in registered:
            continue
        records = by_source.get(source.id, {})
        inventory = {'links': [], 'images': []}
        for record in records.values():
            for occurrence in record['metadata'].get('occurrences') or []:
                hydrated = _hydrate_asset(occurrence, records)
                if hydrated:
                    inventory['links' if record['kind'] == 'link' else 'images'].append(hydrated)
        # A data-only projection avoids mutating ORM source metadata during reads.
        result[doc_id] = SimpleNamespace(**{
            key: getattr(source, key, None) for key in (
                'id', 'space_id', 'kb_id', 'title', 'source_version', 'published_version',
                'source_locator', 'indexed_doc_id', 'ingestion_status',
            )
        }, source_metadata={**(source.source_metadata or {}), 'assets': inventory}, _asset_records=records)
    return result


def hydrate_passage_assets(sources, passages):
    """Restore exact occurrence metadata for the existing asset-selection code."""
    for passage in passages:
        meta = passage.get('meta') or {}
        if meta.get('_assets_hydrated'):
            continue
        records = getattr(sources.get(meta.get('doc_id')), '_asset_records', {})
        raw = meta.get('asset_refs_json')
        try:
            refs = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            refs = []
        if not isinstance(refs, list):
            continue
        grouped = {'links': [], 'images': []}
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            asset = _hydrate_asset(ref, records)
            if asset:
                grouped['links' if asset['kind'] == 'link' else 'images'].append(asset)
        for field, values in grouped.items():
            meta[f'{field}_json'] = json.dumps(values, ensure_ascii=False)
        meta['_assets_hydrated'] = True

"""Resolve and suggest existing images using current Space disclosure policy."""
from __future__ import annotations

import asyncio
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from sqlalchemy import select

from app.models.kb_fact import KBFact
from app.models.space import Space
from app.models.yullo_space_entity import YulloSpaceEntityEvidence
from app.orchestra.ai.db_utils.source_loader import (
    active_chunk_doc_id, load_published_chat_sources, resolve_space_kb_ids,
)
from app.orchestra.ai.knowledge.retrieval.images_retrieval import safe_image_url, select_chat_images
from app.orchestra.ai.appearance_preview.asset_persistence import list_source_extracted_assets
from app.yullo.config.inference import get_chat_image_config
from app.yullo.models.appearance_asset import YulloAppearanceAsset
from app.yullo.schemas.appearance_preview import AppearancePreviewContent, AppearancePreviewSection
from app.yullo.services.entities.payloads import project_public_entity_payload
from app.yullo.services.entities.service import get_public_entities

logger = logging.getLogger(__name__)


def _reference(item):
    return ('entity', item.source_entity_id) if item.source_entity_id else (
        'facts', tuple(sorted(str(value) for value in item.source_fact_ids)),
    )


@dataclass
class AppearanceImages:
    assets: dict
    aliases: dict
    media: dict
    sources: dict
    source_images: dict
    references: dict
    chunks: dict

    def resolve(self, content, *, public=False, strict=False):
        """Resolve URLs from eligible IDs; supplied URLs never establish permission."""
        for section in content.sections:
            for item in section.items:
                if not item.asset_id and not item.image_url:
                    continue
                asset = self.assets.get(item.asset_id) if item.asset_id else self.aliases.get(item.image_url)
                if not asset:
                    if strict:
                        raise HTTPException(422, 'This image is no longer available. Choose another image.')
                    item.image_url, item.asset_id = '', None
                    continue
                item.asset_id = asset['id']
                item.image_url = asset['url'] if public else asset['preview_url']
        return content

    def suggest(self, content, previous=None):
        previous_items = defaultdict(list)
        for section in previous.sections if previous else []:
            for item in section.items:
                previous_items[(section.type, _reference(item))].append(item)
        counts = Counter((section.type, _reference(item)) for section in content.sections for item in section.items)
        image_config = get_chat_image_config()
        for section in content.sections:
            for item in section.items:
                # Image fields from text generation are proposals, never trusted URLs.
                item.image_url, item.asset_id = None, None
                key = (section.type, _reference(item))
                matches = previous_items[key]
                if len(matches) != 1 or counts[key] != 1:
                    matches = [old for old in matches if old.title.casefold() == item.title.casefold()]
                if len(matches) == 1 and (matches[0].image_url is not None or matches[0].asset_id):
                    # Empty imageUrl is the existing explicit Remove marker.
                    item.image_url, item.asset_id = matches[0].image_url, matches[0].asset_id
                    continue
                urls = self.media.get(item.source_entity_id, [])
                if not urls:
                    refs = [('entity', item.source_entity_id)] if item.source_entity_id else []
                    refs.extend(('fact', str(value)) for value in item.source_fact_ids)
                    source_ids, passages = set(), []
                    for ref in refs:
                        for source_id, chunk_id in self.references.get(ref, []):
                            source = self.sources[source_id]
                            source_ids.add(source_id)
                            passages.append({
                                'content': item.title + ' ' + (item.description or ''),
                                'meta': {**self.chunks.get(chunk_id, {}), 'doc_id': active_chunk_doc_id(source)},
                            })
                    images = select_chat_images(
                        [self.sources[source_id] for source_id in sorted(source_ids)], passages,
                        item.title + ' ' + (item.description or ''), config=image_config,
                        images_for_source=lambda source: self.source_images[str(source.id)],
                        doc_id_for_source=active_chunk_doc_id,
                    )
                    urls = [image['url'] for image in images]
                if urls:
                    asset = self.aliases.get(urls[0])
                    if asset:
                        item.asset_id, item.image_url = asset['id'], asset['preview_url']
        return self.resolve(content)


async def load_appearance_images(db, *, space_id: UUID, content: AppearancePreviewContent, suggest=False) -> AppearanceImages:
    """Caller authorizes the Space; every image is rechecked against current public inputs."""
    from app.yullo.services.sources.service import source_images, public_source_asset

    assets, aliases, media = {}, {}, {}

    def register(url, *, asset_id=None, preview_url=None):
        identifier = str(asset_id or uuid5(NAMESPACE_URL, url))
        asset = {'id': identifier, 'url': url, 'preview_url': preview_url or url}
        assets[identifier] = asset
        aliases[url] = aliases[asset['preview_url']] = asset

    uploads = (await db.scalars(select(YulloAppearanceAsset).join(
        Space, Space.id == YulloAppearanceAsset.space_id,
    ).where(YulloAppearanceAsset.space_id == space_id, YulloAppearanceAsset.status == 'active', Space.product == 'yullo'))).all()
    for asset in uploads:
        register(f'/api/v1/yullo/public/assets/{asset.id}', asset_id=asset.id,
                 preview_url=f'/api/v1/yullo/spaces/{space_id}/appearance/assets/{asset.id}/content')
    for entity in await get_public_entities(db, space_id):
        payload = project_public_entity_payload(entity)
        urls = payload.get('media_urls') or []
        urls = urls if isinstance(urls, list) else []
        urls = [*urls, payload.get('image_url')]
        media[str(entity.id)] = [url for value in urls if (url := safe_image_url(value))]
        for url in media[str(entity.id)]:
            register(url)

    kb_ids = await resolve_space_kb_ids(db, space_id, product='yullo')
    sources = await load_published_chat_sources(db, space_id, kb_ids, product='yullo', refresh=True)
    sources = {str(source.id): source for source in sources
               if active_chunk_doc_id(source) and public_source_asset(source.source_metadata or {})}
    images = {key: source_images(source) for key, source in sources.items()}
    for asset in await list_source_extracted_assets(db, space_id=space_id, source_items=list(sources.values()), public_only=True):
        if safe_image_url(asset.url):
            register(asset.url)
    if not suggest:
        return AppearanceImages(assets, aliases, media, sources, images, {}, {})

    entity_ids = {UUID(item.source_entity_id) for section in content.sections for item in section.items if item.source_entity_id in media}
    fact_ids = {value for section in content.sections for item in section.items for value in item.source_fact_ids}
    references = defaultdict(list)

    def reference(kind, identifier, source_id, version, chunk_id):
        source_id = str(source_id)
        source = sources.get(source_id)
        if source and images[source_id] and (version is None or version == (source.source_version or 1)):
            references[(kind, str(identifier))].append((source_id, chunk_id))

    if entity_ids:
        rows = (await db.scalars(select(YulloSpaceEntityEvidence).where(
            YulloSpaceEntityEvidence.space_id == space_id, YulloSpaceEntityEvidence.entity_id.in_(entity_ids),
        ))).all()
        for row in rows:
            reference('entity', row.entity_id, row.source_item_id, row.source_version,
                      (row.locator_metadata or {}).get('source_chunk_id'))
    if fact_ids:
        rows = (await db.scalars(select(KBFact).where(KBFact.space_id == space_id, KBFact.id.in_(fact_ids)))).all()
        for row in rows:
            reference('fact', row.id, row.source_item_id, row.source_version, row.source_chunk_id)

    indices = defaultdict(set)
    for values in references.values():
        for source_id, chunk_id in values:
            doc_id = active_chunk_doc_id(sources[source_id])
            prefix = f'{space_id}:{doc_id}:'
            if isinstance(chunk_id, str) and chunk_id.startswith(prefix) and chunk_id[len(prefix):].isdigit():
                indices[doc_id].add(int(chunk_id[len(prefix):]))
    chunks = {}
    if indices:
        try:
            from app.orchestra.ai.knowledge.vector_store import get_vector_store
            store = get_vector_store()
            for doc_id, values in indices.items():
                for row in await asyncio.to_thread(store.get_chunks_by_indices, str(space_id), doc_id, sorted(values), content=False):
                    chunks[row['id']] = row['metadata']
        except Exception as error:
            logger.warning('yullo.appearance.image_metadata_unavailable', extra={'space_id': str(space_id), 'error_type': type(error).__name__})
    return AppearanceImages(assets, aliases, media, sources, images, references, chunks)


def applied_preview(settings: dict) -> AppearancePreviewContent:
    sections = {}
    for key, raw in (settings.get('appearance_applied_sections') or {}).items():
        try:
            section = AppearancePreviewSection.model_validate(raw)
            if section.type.value == key:
                sections[key] = section
        except ValueError:
            continue
    return AppearancePreviewContent(sections=list(sections.values()))


async def resolve_preview_images(db, *, space_id, content, public=False):
    if not any(item.image_url or item.asset_id for section in content.sections for item in section.items):
        return content
    images = await load_appearance_images(db, space_id=space_id, content=content)
    return images.resolve(content, public=public)

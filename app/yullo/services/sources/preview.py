import asyncio
import logging
import uuid
from typing import Dict, Any, List

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlparse

from app.models.space import Space
from app.models.knowledge_base import KnowledgeBaseItem
from app.orchestra.ai.ingestion.scraper import smart_scrape_url
from app.yullo.services.sources.stream import source_stream

logger = logging.getLogger(__name__)
events = structlog.get_logger(__name__)

PROMPT_VERSION = "batched-preview-v2"

async def extract_and_persist_link_preview(
    db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID, item_id: uuid.UUID, url: str,
) -> Dict[str, Any]:
    from app.orchestra.ai.ingestion.cancellation import run_source_work
    from app.services.ai_usage_context import ai_usage_scope

    source = await db.get(KnowledgeBaseItem, item_id)
    if not source or source.space_id != space_id:
        return {'status': 'unavailable', 'facts': [], 'is_confirmed': False}
    with ai_usage_scope(space_id=space_id, kb_id=source.kb_id, product='yullo', runtime_kind='ingestion'):
        result = await run_source_work(
            lambda: _extract_and_persist_link_preview(
                db, user_id=user_id, space_id=space_id, item_id=item_id, url=url,
            ),
            space_id=space_id, source_id=item_id,
            doc_ids=(f'knowledge:{item_id}:v{source.source_version or 1}',
                     f'preview:{item_id}:v{source.source_version or 1}'),
        )
    return result or {'status': 'cancelled', 'facts': [], 'is_confirmed': False}


async def _extract_and_persist_link_preview(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    space_id: uuid.UUID,
    item_id: uuid.UUID,
    url: str
) -> Dict[str, Any]:
    """
    Scrape, index active chunks, then propose facts/entities for review.
    """
    # 1. Enforce Space ownership boundary
    stmt = select(Space).where(Space.id == space_id, Space.owner_user_id == user_id,
                               Space.product == 'yullo')
    owned_space = await db.scalar(stmt)
    if not owned_space:
        logger.warning(f"extract_and_persist_link_preview: Space {space_id} not owned by user {user_id}")
        return {
            "status": "unavailable",
            "title": url,
            "facts": [],
            "target_badges": ["About", "Category", "Aura knowledge"],
            "raw_text": "",
            "is_confirmed": False
        }

    # Fetch KnowledgeBaseItem
    kb_item = await db.get(KnowledgeBaseItem, item_id)
    if not kb_item or kb_item.space_id != space_id:
        logger.warning(f"extract_and_persist_link_preview: KnowledgeBaseItem {item_id} not found in space {space_id}")
        return {
            "status": "unavailable",
            "title": url,
            "facts": [],
            "target_badges": ["About", "Category", "Aura knowledge"],
            "raw_text": "",
            "is_confirmed": False
        }

    preview_version = kb_item.source_version or 1
    space_name = owned_space.display_name or ""
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    # 2. Emit progress: Scraping page
    await source_stream.emit_progress(db, space_id=space_id, source_id=item_id, progress=25, stage="Reading website content...")

    # Fetch and clean page content via shared Smart Scraper engine
    scrape_res = await smart_scrape_url(
        target_url,
        space_id=space_id,
        item_id=item_id,
    )

    domain = scrape_res.domain or urlparse(target_url).netloc.replace("www.", "") or target_url
    title = scrape_res.title or domain
    clean_text = scrape_res.clean_text
    page_assets = scrape_res.page_assets
    provenance = scrape_res.provenance
    status = "unavailable"

    # Chunk retrieval is active immediately; extracted facts still need approval.
    preview_doc_id = f'knowledge:{item_id}:v{preview_version}'
    indexing_status = None
    indexed_count = 0
    prepared = None
    facts: List[Dict[str, Any]] = []
    entity_candidates = []
    knowledge = None
    if scrape_res.raw_bytes or (clean_text and len(clean_text) >= 30):
        from app.orchestra.ai.ingestion import prepare_source
        from app.orchestra.ai.ingestion.indexing import embed_and_store_chunks
        from app.orchestra.ai.knowledge.extraction.source_extraction import extract_chunk_knowledge
        from app.yullo.config.inference import get_source_extraction_options

        async def preview_progress(stage, completed, total):
            await source_stream.emit_progress(
                db, space_id=space_id, source_id=item_id,
                progress=45 + int(40 * completed / max(total, 1)),
                stage=f"Analyzing page content ({completed}/{total})...",
            )

        try:
            events.info('preview.preparation_started', source_id=str(item_id),
                        source_version=preview_version)
            prepared = await asyncio.to_thread(
                prepare_source, scrape_res.raw_bytes or clean_text.encode('utf-8'),
                scrape_res.filename if scrape_res.raw_bytes else 'content.md',
                web=True,
            )
            clean_text = prepared.document.full_text
            events.info('preview.prepared', source_id=str(item_id),
                        chunks=len(prepared.chunks), pages=prepared.document.page_count)
        except Exception as error:
            indexing_status = 'failed'
            events.warning('preview.preparation_failed', source_id=str(item_id), error_type=type(error).__name__)

        if prepared is not None:
            try:
                await source_stream.emit_progress(
                    db, space_id=space_id, source_id=item_id,
                    progress=40, stage='Preparing source passages...',
                )
                events.info('preview.indexing_started', source_id=str(item_id),
                            doc_id=preview_doc_id, chunks=len(prepared.chunks))
                indexed_count = await embed_and_store_chunks(
                    prepared, client_id=str(space_id), session_id=str(uuid.uuid4()),
                    doc_id=preview_doc_id, filename=title, kb_id=str(kb_item.kb_id),
                    space_id=str(space_id), ttl_days=None,
                )
                from app.yullo.services.sources.service import SourceService
                activated = await SourceService().record_source_index(
                    db, user_id=user_id, space_id=space_id, source_id=item_id,
                    source_version=preview_version, doc_id=preview_doc_id,
                    chunk_count=indexed_count, page_count=prepared.document.page_count,
                )
                if not activated:
                    return {'status': 'cancelled', 'facts': [], 'is_confirmed': False}
                indexing_status = 'done'
                events.info('preview.indexed', space_id=str(space_id), source_id=str(item_id),
                            doc_id=preview_doc_id, chunks=indexed_count)
            except Exception as error:
                await db.rollback()
                indexing_status = 'failed'
                events.warning('preview.indexing_failed', source_id=str(item_id), error_type=type(error).__name__)

            # Preserve grounded facts/entities even when an embedding provider fails.
            chunks = [dict(
                document=chunk.text,
                metadata={**chunk.metadata, 'source_text': chunk.source_text or chunk.text,
                          'page': chunk.page, 'section': chunk.section,
                          'doc_id': preview_doc_id,
                          'client_id': str(space_id), 'filename': title,
                          'is_table': chunk.is_table, 'is_table_row': chunk.is_table_row},
            ) for chunk in prepared.chunks]
            try:
                knowledge = await extract_chunk_knowledge(
                    chunks=chunks, doc_id=preview_doc_id,
                    space_name=space_name, config=get_source_extraction_options(), progress_cb=preview_progress,
                )
                facts = [{**fact, 'text': fact['value'], 'source_locator': target_url}
                         for fact in (knowledge.facts or [])]
                entity_candidates = knowledge.entities or []
            except Exception as error:
                logger.warning('preview.extraction_failed source_id=%s error_type=%s',
                               item_id, type(error).__name__)

    # Reload under a row lock after model calls. Confirmation or a newer source
    # version must win over a late preview, including its job/publication state.
    kb_item = await db.scalar(select(KnowledgeBaseItem).where(
        KnowledgeBaseItem.id == item_id, KnowledgeBaseItem.space_id == space_id,
    ).with_for_update().execution_options(populate_existing=True))
    if not kb_item:
        return {'status': 'unavailable', 'facts': [], 'is_confirmed': False}
    if (kb_item.source_version or 1) != preview_version:
        return {'status': kb_item.ingestion_status, 'title': kb_item.title,
                'facts': kb_item.extracted_facts or [],
                'is_confirmed': bool((kb_item.source_metadata or {}).get('is_confirmed'))}

    if indexing_status == 'done' or facts or entity_candidates:
        status = "ready"
    elif clean_text and len(clean_text) >= 30:
        status = "ready_to_review"
    elif status != "unavailable":
        status = "insufficient_context"

    target_badges = ["About", "Category", "Aura knowledge"]
    raw_text_snippet = clean_text[:1200] if clean_text else f"Source URL: {target_url}"

    favicon_url = page_assets.get("favicon_url")
    preview_image_url = page_assets.get("preview_image_url")
    logo_url = page_assets.get("logo_url")

    # JSON columns need a new value for SQLAlchemy to persist stage outcomes.
    source_metadata = dict(kb_item.source_metadata or {})
    source_metadata.update({
        "status": status,
        "prompt_version": PROMPT_VERSION,
        "source_version": preview_version,
        "raw_text": raw_text_snippet,
        "target_badges": target_badges,
        "is_confirmed": source_metadata.get('chunks_enabled', True),
        "indexing_status": indexing_status,
        "provenance": provenance,
        "favicon_url": favicon_url,
        "preview_image_url": preview_image_url,
        "logo_url": logo_url,
        "assets": page_assets,
        "raw_html_path": page_assets.get("raw_html_path"),
        "raw_deep_path": page_assets.get("raw_deep_path"),
        "fact_extraction_status": (
            knowledge.fact_error or ('done' if facts else 'no_facts_found')
            if knowledge else 'failed' if clean_text else None
        ),
        "entity_extraction_status": (
            knowledge.entity_error or ('done' if entity_candidates else 'no_entities_found')
            if knowledge else 'failed' if clean_text else None
        ),
    })

    # Keep an owner-supplied label. When the initial title is only the URL,
    # replace it with the scraped page title for a friendlier source list.
    persisted_title = (
        kb_item.title
        if kb_item.title and kb_item.title != target_url
        else (title or domain)
    )
    kb_item.title = persisted_title
    if knowledge is not None and knowledge.facts is not None:
        kb_item.extracted_facts = facts
    kb_item.source_metadata = source_metadata
    kb_item.ingestion_status = status

    # Fact rows remain review candidates even though chunks are already active.
    db.add(kb_item)

    if facts:
        from app.models.kb_fact import KBFact
        from sqlalchemy import select as sa_select

        # Check existing facts for this source item to avoid inserting duplicates on re-preview
        existing_facts = (
            await db.scalars(
                sa_select(KBFact).where(
                    KBFact.source_item_id == kb_item.id,
                    KBFact.space_id == space_id,
                    KBFact.source_version == preview_version,
                )
            )
        ).all()
        existing_values = {(ef.subject.strip().casefold(), ef.label.strip().casefold(),
                            ef.value.strip().casefold()) for ef in existing_facts if ef.value}

        for f in facts:
            val = (f.get("text") or "").strip()
            identity = (f['subject'].casefold(), f['label'].casefold(), val.casefold())
            if val and identity not in existing_values:
                kbf = KBFact(
                    kb_id=kb_item.kb_id,
                    space_id=kb_item.space_id,
                    subject=f["subject"],
                    label=f["label"],
                    value=val,
                    note=(f.get("evidence_excerpt") or "").strip(),
                    review_status="extracted",
                    verified=False,
                    source_item_id=kb_item.id,
                    source_filename=persisted_title,
                    source_version=preview_version,
                )
                db.add(kbf)
                existing_values.add(identity)

    # Persist extracted structured entity candidates into YulloSpaceEntity & YulloSpaceEntityEvidence
    if entity_candidates:
        from app.yullo.services.entities.extraction import persist_entity_candidates
        await persist_entity_candidates(
            db,
            source_item_id=kb_item.id,
            source_version=kb_item.source_version or 1,
            candidates=entity_candidates,
        )

    await db.commit()

    # Streaming only announces already-persisted candidates; it cannot approve them.
    if facts:
        await source_stream.emit_facts_streamed(
            db, space_id=space_id, source_id=item_id, facts=facts,
            progress=90, stage='Page facts ready for review',
        )

    # Emit final completion through stream broadcaster
    await source_stream.emit_completed(
        db,
        space_id=space_id,
        source_id=item_id,
        source_version=preview_version,
        facts=facts if knowledge is not None and knowledge.facts is not None else None,
        assets=page_assets,
        status=status,
    )

    return {
        "status": status,
        "title": persisted_title,
        "facts": facts,
        "target_badges": target_badges,
        "raw_text": raw_text_snippet,
        "is_confirmed": source_metadata.get('chunks_enabled', True),
        "prompt_version": PROMPT_VERSION,
        "source_version": preview_version,
        "favicon_url": favicon_url,
        "preview_image_url": preview_image_url,
        "logo_url": logo_url,
        "assets": page_assets,
    }

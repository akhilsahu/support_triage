"""Shared authoritative-fact SQL lookup; no model calls or product defaults.

Yullo facts require explicit fact approval and current visible source evidence.
Support247 retains its source-confirmation policy. Manual facts have no source.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, cast, String, func
from app.models.space import Space
from app.orchestra.ai.db_utils.source_loader import chunk_source_enabled_condition

from app.models.kb_fact import KBFact
from app.models.knowledge_base import KnowledgeBaseItem

import logging

logger = logging.getLogger(__name__)


async def get_authoritative_facts(
    db: AsyncSession,
    space_id: UUID,
    kb_id: UUID,
    topic: Optional[str] = None,
    *, product: str = 'support247',
) -> List[KBFact]:
    """
    Retrieve deterministic, authoritative facts for a given space and knowledge base.

    The retrieval boundary enforces:
    - Proper space and KB isolation.
    - review_status in ('owner_confirmed', 'source_authoritative').
    - Currently valid (valid_from <= NOW and valid_until > NOW or NULL).
    - Not superseded (superseded_by_id IS NULL).
    - Yullo uses current source versions and fact approval; Support247 retains
      ready/confirmed published-source checks (legacy NULL fact versions work).
    - Manual facts require both source_item_id and source_doc_id to be NULL.
    """
    now = datetime.utcnow()
    if product not in ('yullo', 'support247'):
        raise ValueError('Unsupported fact product')
    source_conditions = [
        KnowledgeBaseItem.id.is_not(None),
        KnowledgeBaseItem.space_id == space_id,
        KnowledgeBaseItem.kb_id == kb_id,
    ]
    if product == 'yullo':
        source_conditions.extend([
            or_(KBFact.source_version.is_(None), KBFact.source_version == func.coalesce(KnowledgeBaseItem.source_version, 1)),
            func.coalesce(KnowledgeBaseItem.source_metadata['visibility'].as_string(), 'public').in_(('public', 'public_aura')),
            func.coalesce(KnowledgeBaseItem.source_metadata['disclosure_mode'].as_string(), 'direct') == 'direct',
            chunk_source_enabled_condition(),
        ])
    else:
        source_conditions.extend([
            KnowledgeBaseItem.ingestion_status == 'ready',
            KnowledgeBaseItem.published_version.is_not(None),
            or_(KBFact.source_version.is_(None), KBFact.source_version == KnowledgeBaseItem.published_version),
            cast(KnowledgeBaseItem.source_metadata['is_confirmed'], String) == 'true',
        ])

    # Outerjoin KnowledgeBaseItem so facts without a source item still pass
    query = (
        select(KBFact)
        .outerjoin(
            KnowledgeBaseItem,
            KnowledgeBaseItem.id == KBFact.source_item_id
        )
        .where(
            KBFact.space_id == space_id,
            KBFact.kb_id == kb_id,

            # Only human-confirmed or source-authoritative facts
            KBFact.review_status.in_(['owner_confirmed', 'source_authoritative']),

            # Supersession constraint — exclude facts replaced by newer ones
            KBFact.superseded_by_id.is_(None),

            # Temporal validity — NULL means unbounded
            or_(KBFact.valid_from.is_(None), KBFact.valid_from <= now),
            or_(KBFact.valid_until.is_(None), KBFact.valid_until > now),

            # Version visibility:
            # Either the fact was manually entered (no source linkage at all —
            # both source_item_id AND source_doc_id are null),
            # OR its source item is in 'ready' state and the fact's
            # source_version matches the published version (or is legacy NULL).
            #
            # IMPORTANT: When a KnowledgeBaseItem is deleted the FK is ON DELETE
            # SET NULL, so source_item_id becomes NULL but source_doc_id is
            # preserved. Checking only source_item_id IS NULL would let
            # deleted-source facts pass as if they were manually entered.
            # We guard against this by also requiring source_doc_id IS NULL.
            or_(
                # Truly manually entered — no source linkage whatsoever
                and_(
                    KBFact.source_item_id.is_(None),
                    KBFact.source_doc_id.is_(None),
                ),
                # Normal case: source exists, is ready, version is published
                and_(*source_conditions)
            )
        )
    )
    if product == 'yullo':
        query = query.join(Space, Space.id == KBFact.space_id).where(Space.product == 'yullo', Space.active.is_(True))

    if topic:
        query = query.where(KBFact.topic == topic)

    result = await db.execute(query)
    facts = list(result.scalars().all())

    logger.info(
        "get_authoritative_facts returned %d facts for space=%s kb=%s topic=%s",
        len(facts), space_id, kb_id, topic
    )
    return facts

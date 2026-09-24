from typing import List, Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_

from app.models.kb_fact import KBFact
from app.models.yullo_source import YulloSource


async def get_authoritative_facts(
    db: AsyncSession, 
    space_id: UUID, 
    kb_id: UUID, 
    topic: Optional[str] = None
) -> List[KBFact]:
    """
    Retrieve deterministic, authoritative facts for a given space and knowledge base.
    
    The retrieval boundary enforces:
    - Proper space and KB isolation.
    - review_status in ('owner_confirmed', 'source_authoritative').
    - Currently valid (valid_from <= NOW and valid_until > NOW).
    - Not superseded (superseded_by_id IS NULL).
    - Source version visibility (fact.source_version == yullo_sources.version)
      AND source is in a ready state.
    """
    now = datetime.utcnow()
    
    query = (
        select(KBFact)
        .outerjoin(YulloSource, YulloSource.kb_item_id == KBFact.source_item_id)
        .where(
            KBFact.space_id == space_id,
            KBFact.kb_id == kb_id,
            KBFact.review_status.in_(['owner_confirmed', 'source_authoritative']),
            
            # Supersession constraint
            KBFact.superseded_by_id.is_(None),
            
            # Temporal validity
            or_(KBFact.valid_from.is_(None), KBFact.valid_from <= now),
            or_(KBFact.valid_until.is_(None), KBFact.valid_until > now),
            
            # Version visibility constraint:
            # Either the fact is not tied to a versioned source, 
            # OR it matches the current ready version of the source.
            or_(
                KBFact.source_version.is_(None),
                and_(
                    YulloSource.id.is_not(None),
                    YulloSource.metadata_json['status'].astext == 'ready',
                    KBFact.source_version == YulloSource.version
                )
            )
        )
    )
    
    if topic:
        query = query.where(KBFact.topic == topic)
        
    result = await db.execute(query)
    return list(result.scalars().all())

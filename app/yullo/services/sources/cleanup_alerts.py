from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kb_fact import KBFact
from app.models.space import Space
from app.models.yullo_knowledge_cleanup_alert import YulloKnowledgeCleanupAlert
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity


async def _owned_space(db: AsyncSession, *, user_id: UUID, space_id: UUID) -> Space:
    space = await db.scalar(
        select(Space).where(
            Space.id == space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
        )
    )
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return space


def _fact_summary(fact: KBFact) -> dict:
    return {
        "id": str(fact.id),
        "subject": fact.subject,
        "label": fact.label,
        "value": fact.value,
        "note": fact.note,
        "review_status": fact.review_status,
    }


def _entity_summary(entity: YulloSpaceEntity) -> dict:
    payload = entity.payload_json or {}
    title = payload.get("title") or payload.get("name") or payload.get("label") or "Untitled"
    return {
        "id": str(entity.id),
        "entity_type": entity.entity_type,
        "title": str(title),
        "review_status": entity.review_status,
    }


async def list_cleanup_alerts(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    status: str = "pending",
) -> list[dict]:
    await _owned_space(db, user_id=user_id, space_id=space_id)
    if status not in {"pending", "resolved"}:
        raise HTTPException(status_code=400, detail="Invalid alert status")

    alerts = (
        await db.scalars(
            select(YulloKnowledgeCleanupAlert)
            .where(
                YulloKnowledgeCleanupAlert.space_id == space_id,
                YulloKnowledgeCleanupAlert.status == status,
            )
            .order_by(YulloKnowledgeCleanupAlert.created_at.desc())
        )
    ).all()
    fact_ids = {
        UUID(raw_id)
        for alert in alerts
        for raw_id in (alert.fact_ids or [])
    }
    facts = (
        await db.scalars(
            select(KBFact).where(KBFact.space_id == space_id, KBFact.id.in_(fact_ids))
        )
    ).all() if fact_ids else []
    facts_by_id = {str(fact.id): fact for fact in facts}
    entity_ids = {
        UUID(raw_id)
        for alert in alerts
        for raw_id in (alert.entity_ids or [])
    }
    entities = (
        await db.scalars(
            select(YulloSpaceEntity).where(
                YulloSpaceEntity.space_id == space_id,
                YulloSpaceEntity.id.in_(entity_ids),
            )
        )
    ).all() if entity_ids else []
    entities_by_id = {str(entity.id): entity for entity in entities}

    return [
        {
            "id": str(alert.id),
            "space_id": str(alert.space_id),
            "deleted_source_id": str(alert.deleted_source_id),
            "source_title": alert.source_title,
            "source_locator": alert.source_locator,
            "facts": [
                _fact_summary(facts_by_id[fact_id])
                for fact_id in (alert.fact_ids or [])
                if fact_id in facts_by_id
            ],
            "entities": [
                _entity_summary(entities_by_id[entity_id])
                for entity_id in (alert.entity_ids or [])
                if entity_id in entities_by_id
            ],
            "entity_count": len(alert.entity_ids or []),
            "status": alert.status,
            "revision": alert.revision,
            "created_at": alert.created_at,
        }
        for alert in alerts
    ]


async def resolve_cleanup_alert(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    alert_id: UUID,
    action: str,
    fact_ids: list[UUID] | None,
    entity_ids: list[UUID] | None,
    expected_revision: int,
    acknowledge_unverified: bool,
) -> dict:
    await _owned_space(db, user_id=user_id, space_id=space_id)
    alert = await db.scalar(
        select(YulloKnowledgeCleanupAlert)
        .where(
            YulloKnowledgeCleanupAlert.id == alert_id,
            YulloKnowledgeCleanupAlert.space_id == space_id,
        )
        .with_for_update()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Knowledge review not found")
    if alert.status != "pending":
        raise HTTPException(status_code=409, detail="Knowledge review is already resolved")
    if alert.revision != expected_revision:
        raise HTTPException(status_code=409, detail="Knowledge review changed; refresh and try again")
    if action not in {"delete", "keep"}:
        raise HTTPException(status_code=400, detail="Invalid resolution action")
    if action == "keep" and not acknowledge_unverified:
        raise HTTPException(status_code=400, detail="Acknowledgement is required")

    alert_fact_ids = {UUID(raw_id) for raw_id in (alert.fact_ids or [])}
    selected_fact_ids = set(alert_fact_ids if fact_ids is None else fact_ids)
    if not selected_fact_ids.issubset(alert_fact_ids):
        raise HTTPException(status_code=400, detail="Invalid retained fact selection")
    alert_entity_ids = {UUID(raw_id) for raw_id in (alert.entity_ids or [])}
    selected_entity_ids = set(alert_entity_ids if entity_ids is None else entity_ids)
    if not selected_entity_ids.issubset(alert_entity_ids):
        raise HTTPException(status_code=400, detail="Invalid retained detail selection")
    if not selected_fact_ids and not selected_entity_ids:
        raise HTTPException(status_code=400, detail="Select at least one fact or detail")

    facts = (
        await db.scalars(
            select(KBFact).where(
                KBFact.space_id == space_id,
                KBFact.id.in_(selected_fact_ids),
                KBFact.source_item_id.is_(None),
                KBFact.deleted_source_id == alert.deleted_source_id,
            )
        )
    ).all()
    if {fact.id for fact in facts} != selected_fact_ids:
        raise HTTPException(status_code=409, detail="Retained facts changed; refresh and try again")
    entities = (
        await db.scalars(
            select(YulloSpaceEntity).where(
                YulloSpaceEntity.space_id == space_id,
                YulloSpaceEntity.id.in_(selected_entity_ids),
                YulloSpaceEntity.origin_type == "extracted",
            )
        )
    ).all()
    if {entity.id for entity in entities} != selected_entity_ids:
        raise HTTPException(status_code=409, detail="Retained details changed; refresh and try again")

    if action == "delete":
        for fact in facts:
            await db.delete(fact)
        for entity in entities:
            await db.delete(entity)
    else:
        now = datetime.now(timezone.utc)
        for fact in facts:
            fact.source_doc_id = None
            fact.source_filename = None
            fact.source_page = None
            fact.source_chunk_id = None
            fact.source_version = None
            fact.maintenance_mode = "owner"
            fact.review_status = "owner_confirmed"
            fact.verified = True
            fact.last_verified_at = now
        for entity in entities:
            entity.origin_type = "owner"
            entity.review_status = "owner_confirmed"
            entity.is_active = True
            entity.is_public = True
            entity.revision += 1

    remaining_fact_ids = [
        raw_id for raw_id in (alert.fact_ids or []) if UUID(raw_id) not in selected_fact_ids
    ]
    remaining_entity_ids = [
        raw_id for raw_id in (alert.entity_ids or []) if UUID(raw_id) not in selected_entity_ids
    ]
    alert.fact_ids = remaining_fact_ids
    alert.entity_ids = remaining_entity_ids
    alert.revision += 1
    if not remaining_fact_ids and not remaining_entity_ids:
        alert.status = "resolved"
        alert.resolved_at = datetime.now(timezone.utc)

    yullo_space = await db.scalar(select(YulloSpace).where(YulloSpace.space_id == space_id))
    if yullo_space:
        yullo_space.context_version += 1
    await db.flush()
    return {
        "ok": True,
        "status": alert.status,
        "remaining_facts": len(remaining_fact_ids),
        "remaining_entities": len(remaining_entity_ids),
    }

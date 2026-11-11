import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBaseItem
from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_space_entity import YulloSpaceEntity, YulloSpaceEntityEvidence
from app.yullo.adapters.home_events import append_domain_event
from app.yullo.services.entities.contracts import (
    BulkEntityPatch,
    EntityCommand,
    EntityEvidenceDTO,
    EntityPatch,
    SourceEntityDTO,
    SpaceEntityDTO,
)
from app.yullo.services.entities.payloads import PUBLIC_VISIBILITIES, validate_entity_payload

PUBLIC_REVIEW_STATUSES = ("owner_confirmed", "source_authoritative")


async def _require_space_owner(
    db: AsyncSession, space_id: uuid.UUID, user_id: uuid.UUID
) -> YulloSpace:
    stmt = (
        select(YulloSpace)
        .join(Space, YulloSpace.space_id == Space.id)
        .where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo")
    )
    yullo_space = await db.scalar(stmt)
    if not yullo_space:
        raise HTTPException(status_code=403, detail="Not authorized or Yullo space not found")
    return yullo_space


def _bump_context(yullo_space: YulloSpace) -> None:
    yullo_space.context_version = (yullo_space.context_version or 0) + 1


def _is_eligible(entity: YulloSpaceEntity) -> bool:
    return (
        entity.is_active
        and entity.is_public
        and entity.review_status in PUBLIC_REVIEW_STATUSES
    )


async def get_space_entities(
    db: AsyncSession, *, space_id: uuid.UUID, user_id: uuid.UUID, include_inactive: bool = False
) -> list[SpaceEntityDTO]:
    await _require_space_owner(db, space_id, user_id)
    conditions = [YulloSpaceEntity.space_id == space_id]
    if not include_inactive:
        conditions.append(YulloSpaceEntity.is_active.is_(True))
    stmt = (
        select(YulloSpaceEntity)
        .where(and_(*conditions))
        .order_by(YulloSpaceEntity.created_at.desc())
    )
    result = await db.execute(stmt)
    entities = result.scalars().all()
    return [SpaceEntityDTO.model_validate(e) for e in entities]


async def get_source_entities(
    db: AsyncSession, *, space_id: uuid.UUID, source_id: uuid.UUID, user_id: uuid.UUID
) -> list[SourceEntityDTO]:
    await _require_space_owner(db, space_id, user_id)
    source = await db.scalar(
        select(KnowledgeBaseItem).where(
            KnowledgeBaseItem.id == source_id,
            KnowledgeBaseItem.space_id == space_id,
        )
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    statement = (
        select(YulloSpaceEntity, YulloSpaceEntityEvidence)
        .join(
            YulloSpaceEntityEvidence,
            and_(
                YulloSpaceEntityEvidence.entity_id == YulloSpaceEntity.id,
                YulloSpaceEntityEvidence.space_id == YulloSpaceEntity.space_id,
            ),
        )
        .where(
            YulloSpaceEntity.space_id == space_id,
            YulloSpaceEntityEvidence.source_item_id == source_id,
            YulloSpaceEntity.is_active.is_(True),
        )
        .order_by(YulloSpaceEntity.sort_order, YulloSpaceEntity.created_at)
    )
    if source.source_version is not None:
        statement = statement.where(
            YulloSpaceEntityEvidence.source_version == source.source_version
        )
    rows = (await db.execute(statement)).all()

    grouped: dict[uuid.UUID, tuple[YulloSpaceEntity, list[EntityEvidenceDTO]]] = {}
    for entity, evidence in rows:
        if entity.id not in grouped:
            grouped[entity.id] = (entity, [])
        grouped[entity.id][1].append(
            EntityEvidenceDTO(
                id=evidence.id,
                source_item_id=evidence.source_item_id,
                source_version=evidence.source_version,
                source_title=source.title,
                source_locator=source.source_locator,
                locator_metadata=evidence.locator_metadata,
            )
        )

    return [
        SourceEntityDTO(**SpaceEntityDTO.model_validate(entity).model_dump(), evidence=evidence)
        for entity, evidence in grouped.values()
    ]


async def create_owner_entity(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    space_id: uuid.UUID,
    command: EntityCommand,
    entity_id: uuid.UUID | None = None,
) -> SpaceEntityDTO:
    yullo_space = await _require_space_owner(db, space_id, user_id)

    try:
        normalized_payload = validate_entity_payload(
            command.entity_type, command.schema_version, command.payload_json
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    existing = None
    if entity_id:
        stmt = select(YulloSpaceEntity).where(
            YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id
        )
        existing = (await db.execute(stmt)).scalars().first()
    elif command.identity_key:
        stmt = select(YulloSpaceEntity).where(
            YulloSpaceEntity.space_id == space_id,
            YulloSpaceEntity.entity_type == command.entity_type,
            YulloSpaceEntity.identity_key == command.identity_key,
        )
        existing = (await db.execute(stmt)).scalars().first()

    if existing:
        if (
            existing.entity_type != command.entity_type
            or existing.payload_json != normalized_payload
        ):
            raise HTTPException(
                status_code=409,
                detail="Entity exists with same ID/identity_key but different payload/type",
            )
        return SpaceEntityDTO.model_validate(existing)

    new_id = entity_id or uuid.uuid4()
    kwargs = {
        "id": new_id,
        "space_id": space_id,
        "identity_key": command.identity_key or str(new_id),
        "entity_type": command.entity_type,
        "schema_version": command.schema_version,
        "payload_json": normalized_payload,
        "origin_type": "owner",
        "review_status": "owner_confirmed",
        "is_active": True,
        "is_public": command.is_public,
        "revision": 1,
    }

    entity = YulloSpaceEntity(**kwargs)
    db.add(entity)
    _bump_context(yullo_space)
    await db.flush()

    if _is_eligible(entity):
        await append_domain_event(
            db,
            space_id=space_id,
            event_type="entity.published",
            subject_type="entity",
            subject_id=str(entity.id),
            operation_key=f"entity.published:{entity.id}:{entity.revision}",
            occurred_at=datetime.utcnow(),
            metadata={"entity_type": entity.entity_type, "revision": entity.revision},
        )

    return SpaceEntityDTO.model_validate(entity)


async def update_entity(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    patch: EntityPatch,
) -> SpaceEntityDTO:
    yullo_space = await _require_space_owner(db, space_id, user_id)
    stmt = (
        select(YulloSpaceEntity)
        .where(and_(YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id))
        .with_for_update()
    )
    entity = await db.scalar(stmt)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    if patch.expected_revision is not None and entity.revision != patch.expected_revision:
        raise HTTPException(status_code=409, detail="Revision mismatch")

    was_eligible = _is_eligible(entity)
    changed = False

    if patch.payload_json is not None:
        try:
            # Validate patch as full merged payload (assuming patch.payload_json is the full new payload in this context)
            normalized_payload = validate_entity_payload(
                entity.entity_type, entity.schema_version, patch.payload_json
            )
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

        if normalized_payload != entity.payload_json:
            entity.payload_json = normalized_payload
            changed = True

    if patch.is_active is not None and patch.is_active != entity.is_active:
        entity.is_active = patch.is_active
        changed = True
    if patch.is_public is not None and patch.is_public != entity.is_public:
        entity.is_public = patch.is_public
        changed = True
    VALID_REVIEW_STATUSES = {"owner_confirmed", "extracted", "superseded", "rejected", "source_authoritative"}
    if patch.review_status is not None:
        if patch.review_status not in VALID_REVIEW_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid review_status: {patch.review_status}")
        if patch.review_status != entity.review_status:
            entity.review_status = patch.review_status
            changed = True

    if changed:
        entity.revision += 1
        _bump_context(yullo_space)

    is_now_eligible = _is_eligible(entity)

    if not was_eligible and is_now_eligible:
        await append_domain_event(
            db,
            space_id=space_id,
            event_type="entity.published",
            subject_type="entity",
            subject_id=str(entity.id),
            operation_key=f"entity.published:{entity.id}:{entity.revision}",
            occurred_at=datetime.utcnow(),
            metadata={"entity_type": entity.entity_type, "revision": entity.revision},
        )
    elif was_eligible and not is_now_eligible:
        await append_domain_event(
            db,
            space_id=space_id,
            event_type="entity.unpublished",
            subject_type="entity",
            subject_id=str(entity.id),
            operation_key=f"entity.unpublished:{entity.id}:{entity.revision}",
            occurred_at=datetime.utcnow(),
            metadata={"entity_type": entity.entity_type, "revision": entity.revision},
        )

    await db.flush()
    return SpaceEntityDTO.model_validate(entity)


async def bulk_update_entities(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    space_id: uuid.UUID,
    patch: BulkEntityPatch,
) -> list[SpaceEntityDTO]:
    yullo_space = await _require_space_owner(db, space_id, user_id)
    if not patch.entity_ids:
        return []

    VALID_REVIEW_STATUSES = {"owner_confirmed", "extracted", "superseded", "rejected", "source_authoritative"}
    if patch.review_status is not None and patch.review_status not in VALID_REVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid review_status: {patch.review_status}")

    stmt = (
        select(YulloSpaceEntity)
        .where(and_(
            YulloSpaceEntity.id.in_(patch.entity_ids),
            YulloSpaceEntity.space_id == space_id
        ))
        .with_for_update()
    )
    res = await db.execute(stmt)
    entities = res.scalars().all()

    changed_any = False
    updated_dtos = []
    for entity in entities:
        was_eligible = _is_eligible(entity)
        row_changed = False
        if patch.is_active is not None and patch.is_active != entity.is_active:
            entity.is_active = patch.is_active
            row_changed = True
        if patch.is_public is not None and patch.is_public != entity.is_public:
            entity.is_public = patch.is_public
            row_changed = True
        if patch.review_status is not None and patch.review_status != entity.review_status:
            entity.review_status = patch.review_status
            row_changed = True

        if row_changed:
            entity.revision += 1
            changed_any = True
            is_now_eligible = _is_eligible(entity)
            if not was_eligible and is_now_eligible:
                await append_domain_event(
                    db,
                    space_id=space_id,
                    event_type="entity.published",
                    subject_type="entity",
                    subject_id=str(entity.id),
                    operation_key=f"entity.published:{entity.id}:{entity.revision}",
                    occurred_at=datetime.utcnow(),
                    metadata={"entity_type": entity.entity_type, "revision": entity.revision},
                )
            elif was_eligible and not is_now_eligible:
                await append_domain_event(
                    db,
                    space_id=space_id,
                    event_type="entity.unpublished",
                    subject_type="entity",
                    subject_id=str(entity.id),
                    operation_key=f"entity.unpublished:{entity.id}:{entity.revision}",
                    occurred_at=datetime.utcnow(),
                    metadata={"entity_type": entity.entity_type, "revision": entity.revision},
                )

        updated_dtos.append(SpaceEntityDTO.model_validate(entity))

    if changed_any:
        _bump_context(yullo_space)

    await db.flush()
    return updated_dtos


async def confirm_entity(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    expected_revision: int,
    is_public: bool | None = None,
) -> SpaceEntityDTO:
    yullo_space = await _require_space_owner(db, space_id, user_id)
    stmt = (
        select(YulloSpaceEntity)
        .where(and_(YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id))
        .with_for_update()
    )
    entity = await db.scalar(stmt)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    if entity.revision != expected_revision:
        raise HTTPException(status_code=409, detail="Revision mismatch")

    was_eligible = _is_eligible(entity)

    changed = False
    if entity.review_status != "owner_confirmed":
        if entity.origin_type == "extracted":
            stmt_ev = select(YulloSpaceEntityEvidence).where(
                YulloSpaceEntityEvidence.entity_id == entity.id
            )
            ev_list = (await db.execute(stmt_ev)).scalars().all()
            if not ev_list:
                raise HTTPException(
                    status_code=422, detail="Cannot confirm extracted entity without evidence"
                )
        entity.review_status = "owner_confirmed"
        changed = True
    if is_public is not None and entity.is_public != is_public:
        entity.is_public = is_public
        changed = True
    if changed:
        entity.revision += 1
        _bump_context(yullo_space)

    is_now_eligible = _is_eligible(entity)

    if not was_eligible and is_now_eligible:
        await append_domain_event(
            db,
            space_id=space_id,
            event_type="entity.published",
            subject_type="entity",
            subject_id=str(entity.id),
            operation_key=f"entity.published:{entity.id}:{entity.revision}",
            occurred_at=datetime.utcnow(),
            metadata={"entity_type": entity.entity_type, "revision": entity.revision},
        )

    await db.flush()
    return SpaceEntityDTO.model_validate(entity)


async def archive_entity(
    db: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID, entity_id: uuid.UUID
) -> None:
    yullo_space = await _require_space_owner(db, space_id, user_id)
    stmt = (
        select(YulloSpaceEntity)
        .where(and_(YulloSpaceEntity.id == entity_id, YulloSpaceEntity.space_id == space_id))
        .with_for_update()
    )
    entity = await db.scalar(stmt)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    entity.is_active = False
    entity.revision += 1
    _bump_context(yullo_space)
    await db.flush()


async def reject_entity(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    expected_revision: int,
) -> SpaceEntityDTO:
    yullo_space = await _require_space_owner(db, space_id, user_id)
    entity = await db.scalar(
        select(YulloSpaceEntity)
        .where(
            YulloSpaceEntity.id == entity_id,
            YulloSpaceEntity.space_id == space_id,
        )
        .with_for_update()
    )
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    if entity.revision != expected_revision:
        raise HTTPException(status_code=409, detail="Revision mismatch")
    if entity.review_status == "source_authoritative":
        raise HTTPException(
            status_code=409, detail="Source-authoritative detail cannot be rejected here"
        )

    if entity.review_status != "rejected" or entity.is_active or entity.is_public:
        entity.review_status = "rejected"
        entity.is_active = False
        entity.is_public = False
        entity.revision += 1
        _bump_context(yullo_space)
        await db.flush()
    return SpaceEntityDTO.model_validate(entity)


def public_entity_predicates(space_id: uuid.UUID) -> tuple:
    """Canonical public-Aura eligibility boundary for structured entities."""
    return (
        YulloSpaceEntity.space_id == space_id,
        YulloSpaceEntity.is_public.is_(True),
        YulloSpaceEntity.is_active.is_(True),
        YulloSpaceEntity.review_status.in_(PUBLIC_REVIEW_STATUSES),
        or_(
            YulloSpaceEntity.visibility.is_(None),
            YulloSpaceEntity.visibility.in_(PUBLIC_VISIBILITIES),
        ),
    )



async def get_public_entities(
    db: AsyncSession, space_id: uuid.UUID, *, entity_types: tuple[str, ...] | None = None,
) -> list[YulloSpaceEntity]:
    """Read eligible records in one Space; callers select their supported types."""
    conditions = list(public_entity_predicates(space_id))
    if entity_types is not None:
        conditions.append(YulloSpaceEntity.entity_type.in_(entity_types))
    result = await db.execute(select(YulloSpaceEntity).where(*conditions)
                              .order_by(YulloSpaceEntity.sort_order, YulloSpaceEntity.id))
    return list(result.scalars().all())


async def get_published_contact_evidence(
    db: AsyncSession, *, space_id: uuid.UUID, kb_ids: list[uuid.UUID],
) -> list[tuple]:
    """Load public contact entities with same-Space, published source evidence."""

    if not kb_ids:
        return []
    result = await db.execute(
        select(YulloSpaceEntity, YulloSpaceEntityEvidence, KnowledgeBaseItem)
        .join(YulloSpaceEntityEvidence, YulloSpaceEntityEvidence.entity_id == YulloSpaceEntity.id)
        .join(KnowledgeBaseItem, KnowledgeBaseItem.id == YulloSpaceEntityEvidence.source_item_id)
        .where(
            *public_entity_predicates(space_id),
            YulloSpaceEntity.entity_type == 'contact_channel',
            YulloSpaceEntityEvidence.space_id == space_id,
            KnowledgeBaseItem.space_id == space_id,
            KnowledgeBaseItem.kb_id.in_(kb_ids),
            KnowledgeBaseItem.ingestion_status == 'ready',
            YulloSpaceEntityEvidence.source_version == KnowledgeBaseItem.published_version,
        )
    )
    return list(result.all())


async def get_chat_fact_evidence(db, context, kb_ids):
    """Project approved facts and source-bound contacts for one authorized KB scope."""
    from app.orchestra.ai.db_utils.get_facts import get_authoritative_facts
    evidence = []
    # 1. Fetch Authoritative Facts
    for kb_id in kb_ids:
        facts = await get_authoritative_facts(db, space_id=context.space_id, kb_id=kb_id, product='yullo')
        for fact in facts:
            # Preserve the existing approved-fact selection; relevance filtering is separate.
            evidence.append({
                "id": str(fact.id),
                "subject": fact.subject,
                "label": fact.label,
                "value": fact.value,
                "source_item_id": str(fact.source_item_id) if fact.source_item_id else None,
                "review_status": fact.review_status,
            })

    # Approved source-bound contacts retain the organization and documented purpose.
    from app.yullo.services.entities.payloads import project_public_entity_payload

    contacts = await get_published_contact_evidence(
        db, space_id=context.space_id, kb_ids=kb_ids,
    )
    seen_contacts = set()
    from app.orchestra.ai.db_utils.source_loader import source_chunks_enabled
    for entity, provenance, source in contacts:
        if entity.id in seen_contacts or not source_chunks_enabled(source):
            continue
        if entity.disclosure_mode in ('action_only', 'on_request'):
            continue
        payload = project_public_entity_payload(entity)
        # Legacy unidentified contacts cannot be inferred as the Space owner's contact.
        if not payload.get('value') or not payload.get('organization') or not payload.get('purpose'):
            continue
        seen_contacts.add(entity.id)
        evidence.append({
            'id': str(entity.id), 'subject': payload['organization'],
            'label': payload['purpose'], 'value': payload['value'],
            'organization': payload['organization'], 'purpose': payload['purpose'],
            'relationship': payload.get('relationship', 'unknown'),
            'disclosure_mode': entity.disclosure_mode,
            'source_item_id': str(source.id), 'source_version': provenance.source_version,
            'source_page': (provenance.locator_metadata or {}).get('page'),
            'evidence_excerpt': (provenance.locator_metadata or {}).get('evidence_excerpt'),
            'review_status': entity.review_status,
        })
    return evidence


async def get_chat_entities(db, context):
    """Load eligible, policy-projected card records for the current Space."""
    from app.orchestra.ai.ui_render.entity_cards import UI_TYPE_TO_ENTITY_TYPE
    from app.yullo.services.entities.payloads import public_entity_card
    records = await get_public_entities(db, context.space_id, entity_types=tuple(UI_TYPE_TO_ENTITY_TYPE.values()))
    return [public_entity_card(entity) for entity in records]

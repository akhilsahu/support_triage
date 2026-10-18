from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kb_fact import KBFact
from app.models.knowledge_base import KnowledgeBaseItem
from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.yullo.schemas.knowledge import SourceFactResponse


async def _require_owned_source(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, source_id: UUID
) -> tuple[YulloSpace, KnowledgeBaseItem]:
    statement = (
        select(YulloSpace, KnowledgeBaseItem)
        .join(Space, Space.id == YulloSpace.space_id)
        .join(KnowledgeBaseItem, KnowledgeBaseItem.space_id == Space.id)
        .where(
            Space.id == space_id,
            Space.owner_user_id == user_id,
            Space.product == "yullo",
            KnowledgeBaseItem.id == source_id,
        )
    )
    row = (await db.execute(statement)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Source not found")
    return row[0], row[1]


def _source_locator(fact: KBFact, source: KnowledgeBaseItem) -> str:
    if fact.source_page:
        return f"Page {fact.source_page}"
    if fact.source_chunk_id:
        return f"Chunk {fact.source_chunk_id}"
    return source.source_locator or source.title or "Source excerpt"


def _to_response(fact: KBFact, source: KnowledgeBaseItem) -> SourceFactResponse:
    return SourceFactResponse(
        id=fact.id,
        source_item_id=source.id,
        source_version=fact.source_version,
        subject=fact.subject,
        label=fact.label,
        value=fact.value,
        note=fact.note,
        review_status=fact.review_status,
        verified=fact.verified,
        source_page=fact.source_page,
        source_chunk_id=str(fact.source_chunk_id) if fact.source_chunk_id else None,
        source_locator=_source_locator(fact, source),
        last_verified_at=fact.last_verified_at,
    )


def apply_fact_review(fact: KBFact, *, review_status: str, reviewed_at: datetime) -> bool:
    if review_status not in {"owner_confirmed", "rejected", "extracted"}:
        raise ValueError("Unsupported fact review status")
    if fact.review_status in {"source_authoritative", "superseded"}:
        raise ValueError(f"A {fact.review_status} fact cannot be changed here")

    verified = review_status == "owner_confirmed"
    changed = fact.review_status != review_status or fact.verified != verified
    if not changed:
        return False

    fact.review_status = review_status
    fact.verified = verified
    fact.last_verified_at = reviewed_at if verified else None
    return True


async def list_source_facts(
    db: AsyncSession, *, user_id: UUID, space_id: UUID, source_id: UUID
) -> list[SourceFactResponse]:
    _, source = await _require_owned_source(
        db, user_id=user_id, space_id=space_id, source_id=source_id
    )
    conditions = [
        KBFact.space_id == space_id,
        KBFact.kb_id == source.kb_id,
        KBFact.source_item_id == source.id,
        KBFact.superseded_by_id.is_(None),
    ]
    if source.source_version is not None:
        conditions.append(
            or_(
                KBFact.source_version.is_(None),
                KBFact.source_version == source.source_version,
            )
        )
    facts = (
        await db.scalars(
            select(KBFact)
            .where(*conditions)
            .order_by(KBFact.source_page.asc().nullslast(), KBFact.created_at.asc())
        )
    ).all()
    if facts:
        return [_to_response(fact, source) for fact in facts]

    # Fallback to source.extracted_facts if KBFact table has no persisted rows yet
    if source.extracted_facts:
        fallback_facts: list[SourceFactResponse] = []
        for i, ef in enumerate(source.extracted_facts):
            val = ef.get("value") or ef.get("text") or ""
            if val:
                fallback_facts.append(SourceFactResponse(
                    id=UUID(int=source.id.int ^ (i + 1)),
                    source_item_id=source.id,
                    source_version=source.source_version,
                    subject=ef.get("subject") or source.title or "Fact",
                    label=ef.get("label") or "Overview",
                    value=val,
                    note=ef.get("note") or ef.get("evidence_excerpt"),
                    review_status="extracted",
                    verified=False,
                    source_locator=ef.get("source_locator") or source.source_locator or "Web Page",
                ))
        return fallback_facts

    return []


async def review_source_fact(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    source_id: UUID,
    fact_id: UUID,
    review_status: str,
    expected_status: str | None,
) -> SourceFactResponse:
    yullo_space, source = await _require_owned_source(
        db, user_id=user_id, space_id=space_id, source_id=source_id
    )
    fact = await db.scalar(
        select(KBFact)
        .where(
            KBFact.id == fact_id,
            KBFact.space_id == space_id,
            KBFact.kb_id == source.kb_id,
            KBFact.source_item_id == source.id,
        )
        .with_for_update()
    )
    if fact is None:
        raise HTTPException(status_code=404, detail="Fact not found")
    if (
        source.source_version is not None
        and fact.source_version is not None
        and fact.source_version != source.source_version
    ):
        raise HTTPException(status_code=409, detail="Fact belongs to an older source version")
    if expected_status is not None and fact.review_status != expected_status:
        raise HTTPException(status_code=409, detail="Fact status changed; refresh and try again")

    try:
        changed = apply_fact_review(
            fact,
            review_status=review_status,
            reviewed_at=datetime.now(UTC),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if changed:
        yullo_space.context_version = (yullo_space.context_version or 0) + 1
        await db.flush()
    return _to_response(fact, source)

import pytest
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.kb_fact import KBFact
from app.models.yullo_source import YulloSource
from app.orchestra.ai.db_utils.get_facts import get_authoritative_facts

pytestmark = pytest.mark.asyncio



@pytest.fixture
async def setup_spaces_kbs(db_session: AsyncSession):
    s1 = Space(
        id=uuid.uuid4(),
        slug=f"space-1-{uuid.uuid4().hex[:6]}",
        display_name="Space 1",
        email=f"s1-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="support247"
    )
    s2 = Space(
        id=uuid.uuid4(),
        slug=f"space-2-{uuid.uuid4().hex[:6]}",
        display_name="Space 2",
        email=f"s2-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="support247"
    )
    db_session.add_all([s1, s2])
    await db_session.commit()
    await db_session.refresh(s1)
    await db_session.refresh(s2)

    kb1 = KnowledgeBase(space_id=s1.id, name="KB 1")
    kb2 = KnowledgeBase(space_id=s2.id, name="KB 2")
    db_session.add_all([kb1, kb2])
    await db_session.commit()
    await db_session.refresh(kb1)
    await db_session.refresh(kb2)

    return s1, s2, kb1, kb2


@pytest.mark.asyncio
async def test_fact_creation_and_isolation(db_session: AsyncSession, setup_spaces_kbs):
    s1, s2, kb1, kb2 = setup_spaces_kbs

    # 1. Valid fact creation
    fact1 = KBFact(
        kb_id=kb1.id,
        space_id=s1.id,
        subject="Product A",
        label="Pricing",
        value="$100",
        review_status="extracted"
    )
    db_session.add(fact1)
    await db_session.commit()

    # 2. Mismatched space_id and kb_id should raise IntegrityError due to composite FK
    fact2 = KBFact(
        kb_id=kb1.id,
        space_id=s2.id, # Wrong space
        subject="Product B",
        label="Pricing",
        value="$200",
        review_status="extracted"
    )
    db_session.add(fact2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_fact_check_constraints_review_status(db_session: AsyncSession, setup_spaces_kbs):
    s1, _, kb1, _ = setup_spaces_kbs
    s1_id = s1.id; kb1_id = kb1.id
    f = KBFact(kb_id=kb1_id, space_id=s1_id, subject="A", label="B", value="C", review_status="invalid_status")
    db_session.add(f)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

@pytest.mark.asyncio
async def test_fact_check_constraints_verified(db_session: AsyncSession, setup_spaces_kbs):
    s1, _, kb1, _ = setup_spaces_kbs
    s1_id = s1.id; kb1_id = kb1.id

    # 2. verified mismatch
    f = KBFact(kb_id=kb1.id, space_id=s1.id, subject="A", label="B", value="C", review_status="owner_confirmed", verified=False)
    db_session.add(f)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

@pytest.mark.asyncio
async def test_fact_check_constraints_self_supersede(db_session: AsyncSession, setup_spaces_kbs):
    s1, _, kb1, _ = setup_spaces_kbs
    s1_id = s1.id; kb1_id = kb1.id
    # 3. self-supersession
    f = KBFact(kb_id=kb1_id, space_id=s1_id, subject="A", label="B", value="C")
    db_session.add(f)
    await db_session.flush()
    
    f.superseded_by_id = f.id
    f.review_status = "superseded"
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

@pytest.mark.asyncio
async def test_fact_check_constraints_supersession_consistency(db_session: AsyncSession, setup_spaces_kbs):
    s1, _, kb1, _ = setup_spaces_kbs
    s1_id = s1.id; kb1_id = kb1.id
    # 4. supersession consistency
    f = KBFact(kb_id=kb1_id, space_id=s1_id, subject="A", label="B", value="C", review_status="superseded")
    db_session.add(f)
    with pytest.raises(IntegrityError):
        await db_session.flush() # fails because superseded_by_id IS NULL
    await db_session.rollback()

@pytest.mark.asyncio
async def test_fact_check_constraints_temporal(db_session: AsyncSession, setup_spaces_kbs):
    s1, _, kb1, _ = setup_spaces_kbs
    s1_id = s1.id; kb1_id = kb1.id
    # 5. valid_until > valid_from
    now = datetime.utcnow()
    f = KBFact(
        kb_id=kb1_id, space_id=s1_id, subject="A", label="B", value="C",
        valid_from=now, valid_until=now - timedelta(days=1)
    )
    db_session.add(f)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_authoritative_retrieval(db_session: AsyncSession, setup_spaces_kbs):
    s1, _, kb1, _ = setup_spaces_kbs

    item = KnowledgeBaseItem(kb_id=kb1.id, space_id=s1.id, item_type="doc", doc_id="doc1",
                             ingestion_status="ready", source_version=2, published_version=2,
                             source_metadata={"is_confirmed": True})
    db_session.add(item)
    await db_session.commit()

    source = YulloSource(space_id=s1.id, type="PDF", metadata_json={"status": "ready"}, version=2, kb_item_id=item.id)
    db_session.add(source)
    await db_session.commit()

    # Fact 1: Owner confirmed, correct version
    f1 = KBFact(
        kb_id=kb1.id, space_id=s1.id, subject="A", label="B", value="C",
        review_status="owner_confirmed", verified=True,
        source_item_id=item.id, source_version=2
    )
    
    # Fact 2: Stale version
    f2 = KBFact(
        kb_id=kb1.id, space_id=s1.id, subject="D", label="E", value="F",
        review_status="owner_confirmed", verified=True,
        source_item_id=item.id, source_version=1
    )

    # Fact 3: Extracted only
    f3 = KBFact(
        kb_id=kb1.id, space_id=s1.id, subject="G", label="H", value="I",
        review_status="extracted", verified=False,
        source_item_id=item.id, source_version=2
    )

    db_session.add_all([f1, f2, f3])
    await db_session.flush()

    # Fact 4: Superseded
    f4 = KBFact(
        kb_id=kb1.id, space_id=s1.id, subject="J", label="K", value="L",
        review_status="superseded", verified=False,
        source_item_id=item.id, source_version=2, superseded_by_id=f1.id
    )

    db_session.add(f4)
    await db_session.commit()

    facts = await get_authoritative_facts(db_session, s1.id, kb1.id)
    
    # Only f1 should be returned
    assert len(facts) == 1
    assert facts[0].id == f1.id

    # The canonical knowledge item controls whether its facts are eligible.
    item.ingestion_status = "removed"
    db_session.add(item)
    await db_session.commit()
    facts = await get_authoritative_facts(db_session, s1.id, kb1.id)
    assert len(facts) == 0

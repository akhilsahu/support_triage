import uuid
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.models.space import Space
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.models.yullo_source import YulloSource
from app.core.database import engine

pytestmark = pytest.mark.asyncio

@pytest.fixture
async def db_session():
    async with engine.begin() as conn:
        from sqlalchemy.ext.asyncio import async_sessionmaker
        session_maker = async_sessionmaker(bind=conn, class_=AsyncSession, expire_on_commit=False)
        session = session_maker()
        yield session
        await session.close()
        await conn.rollback()

async def test_yullo_source_creation(db_session: AsyncSession):
    space_id = uuid.uuid4()
    space = Space(
        id=space_id, 
        slug=f"yullo-src-{space_id}", 
        product="yullo",
        display_name="Test Space",
        email="test@yullo.com",
        password_hash="fakehash"
    )
    db_session.add(space)

    kb_id = uuid.uuid4()
    kb = KnowledgeBase(id=kb_id, space_id=space_id, name="Test KB")
    db_session.add(kb)

    item_id = uuid.uuid4()
    kb_item = KnowledgeBaseItem(
        id=item_id,
        kb_id=kb_id,
        item_type="doc",
        title="Test Doc",
        doc_id="test-doc-123",
        indexed_doc_id="test-doc-123"
    )
    db_session.add(kb_item)
    await db_session.flush()

    source = YulloSource(
        space_id=space_id,
        kb_item_id=item_id,
        type="PDF",
        metadata_json={"filename": "test.pdf"}
    )
    db_session.add(source)
    await db_session.flush()

    assert source.id is not None
    assert source.space_id == space_id
    assert source.kb_item_id == item_id
    assert source.type == "PDF"
    assert source.metadata_json == {"filename": "test.pdf"}
    assert source.created_at is not None

    source2 = YulloSource(
        type="PDF",
        metadata_json={"filename": "test2.pdf"}
    )
    db_session.add(source2)
    
    with pytest.raises(IntegrityError):
        await db_session.flush()

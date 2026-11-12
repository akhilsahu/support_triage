import pytest
import uuid
import anyio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.space import Space
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem
from app.orchestra.ai.ingestion.jobs.tasks import _attach_kb_item


pytestmark = pytest.mark.asyncio


async def test_yullo_document_storage_trace(db_session: AsyncSession):
    """
    Test the canonical tracing of a document through ingestion:
    YulloSource -> KnowledgeBaseItem -> ChromaDB Doc ID
    
    This ensures we understand exactly what fields link where before building yullo_sources.
    """
    space_id = uuid.uuid4()
    space = Space(
        id=space_id, 
        slug=f"test-trace-{space_id}", 
        product="yullo",
        display_name="Test Space",
        email="test@yullo.com",
        password_hash="fakehash"
    )
    db_session.add(space)
    
    kb_id = uuid.uuid4()
    kb = KnowledgeBase(id=kb_id, space_id=space_id, name="Test KB")
    db_session.add(kb)
    
    await db_session.flush()

    # 1. Ingestion generates a doc_id
    generated_doc_id = str(uuid.uuid4())[:8]

    # 2. _attach_kb_item links kb_id -> doc_id
    # Mock AsyncSessionLocal so _attach_kb_item uses the test's transaction
    import contextlib
    from unittest.mock import patch
    
    @contextlib.asynccontextmanager
    async def mock_session():
        yield db_session

    with patch('app.core.database.AsyncSessionLocal', new=mock_session), patch('app.orchestra.ai.knowledge.vector_store.get_vector_store'):
        await _attach_kb_item(
            kb_id=str(kb_id),
            doc_id=generated_doc_id,
            title="My Trace Doc",
            item_type="doc",
            content="Some raw content",
            topic="TraceTopic"
        )

    # 3. Verify the link
    # We must open a new transaction or reuse db_session to query it
    result = await db_session.execute(
        select(KnowledgeBaseItem).where(KnowledgeBaseItem.kb_id == kb_id)
    )
    items = result.scalars().all()
    
    assert len(items) == 1
    item = items[0]
    
    # 4. Verify canonical identifiers
    assert item.doc_id == generated_doc_id
    assert item.indexed_doc_id == generated_doc_id
    assert item.topic == "TraceTopic"

    # In Yullo, we will link YulloSource to this KnowledgeBaseItem.id, 
    # fully bypassing the legacy `documents` table which is entirely dead.

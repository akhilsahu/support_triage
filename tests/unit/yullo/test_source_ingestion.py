import uuid
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.space import Space
from app.models.yullo_source import YulloSource
from app.yullo.adapters.ingestion import YulloIngestionAdapter
from app.core.database import engine
from unittest.mock import patch, MagicMock

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

@patch('app.yullo.adapters.ingestion.fetch_url')
@patch('app.yullo.adapters.ingestion.get_job_runner')
async def test_yullo_ingestion_adapter(mock_get_job_runner, mock_fetch_url, db_session: AsyncSession):
    mock_runner = MagicMock()
    mock_get_job_runner.return_value = mock_runner
    
    mock_page = MagicMock()
    mock_page.raw = b"<html>Test</html>"
    mock_page.title = "Test Page"
    mock_page.filename = "page.html"
    mock_fetch_url.return_value = mock_page

    space_id = uuid.uuid4()
    space = Space(
        id=space_id,
        slug=f"test-yullo-{space_id}",
        product="yullo",
        display_name="Test Space",
        email="test@yullo.com",
        password_hash="fakehash"
    )
    db_session.add(space)
    await db_session.flush()

    adapter = YulloIngestionAdapter(db_session)
    
    # Test enqueue text
    source1 = await adapter.enqueue_text(
        space_id=space_id,
        text="This is some test text.",
        metadata={"filename": "pasted.txt"}
    )
    
    assert source1.id is not None
    assert source1.type == "text"
    assert source1.space_id == space_id
    assert source1.metadata_json.get("status") == "queued"
    
    # Test enqueue url
    source2 = await adapter.enqueue_url(
        space_id=space_id,
        url="https://example.com"
    )
    
    assert source2.id is not None
    assert source2.type == "website"
    assert source2.space_id == space_id
    assert source2.metadata_json.get("status") == "queued"
    assert source2.metadata_json.get("content_ref") == "https://example.com"

    # Test get status
    status = await adapter.get_status(source1.id)
    assert status["status"] == "queued"

    # Test remove source
    await adapter.remove_source(source1.id)
    deleted_source = await db_session.get(YulloSource, source1.id)
    assert deleted_source is None

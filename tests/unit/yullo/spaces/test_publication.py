import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from app.yullo.services.spaces.publication import publish_space, validate_publication_readiness
from fastapi import HTTPException

@pytest.fixture
def mock_db():
    db = AsyncMock()
    return db

@pytest.mark.asyncio
async def test_validate_publication_readiness_not_found(mock_db):
    mock_result = MagicMock()
    mock_result.scalars().first.return_value = None
    mock_db.execute.return_value = mock_result
    
    assert await validate_publication_readiness(mock_db, space_id=uuid4(), owner_user_id=uuid4()) is False

@pytest.mark.asyncio
async def test_validate_publication_readiness_success(mock_db):
    owner_id = uuid4()
    
    mock_space = MagicMock()
    mock_space.owner_user_id = owner_id
    mock_space.slug = "valid-slug"
    
    mock_y_space = MagicMock()
    mock_y_config = MagicMock()
    mock_kb = MagicMock()
    mock_ready_item = MagicMock()
    mock_ready_item.ingestion_status = "ready"
    
    # Setup sequential returns for scalars().first()
    mock_result1 = MagicMock()
    mock_result1.scalars().first.return_value = mock_space
    
    mock_result2 = MagicMock()
    mock_result2.scalars().first.return_value = mock_y_space
    
    mock_result3 = MagicMock()
    mock_result3.scalars().first.return_value = mock_y_config
    
    mock_result4 = MagicMock()
    mock_result4.scalars().first.return_value = mock_kb
    
    mock_result5 = MagicMock()
    mock_result5.scalars().all.return_value = [mock_ready_item]
    mock_result5.scalars().first.return_value = mock_ready_item
    
    mock_db.execute.side_effect = [mock_result1, mock_result2, mock_result3, mock_result4, mock_result5]
    
    assert await validate_publication_readiness(mock_db, space_id=uuid4(), owner_user_id=owner_id) is True

@pytest.mark.asyncio
async def test_publish_space_not_found(mock_db):
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_db.execute.return_value = mock_result
    
    with pytest.raises(HTTPException) as exc_info:
        await publish_space(mock_db, space_id=uuid4(), owner_user_id=uuid4())
    assert exc_info.value.status_code == 404

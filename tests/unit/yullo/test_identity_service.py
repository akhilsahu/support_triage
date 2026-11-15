import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from app.yullo.services.persistence.identity import get_identity, update_identity, change_handle
from app.yullo.schemas.forms.identity import IdentityFormUpdate, SpacePurpose
from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.models.yullo_config import YulloConfig
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_get_identity_not_found():
    db = AsyncMock()
    db.scalar.return_value = None
    
    with pytest.raises(HTTPException) as exc:
        await get_identity(db, space_id=uuid4(), user_id=uuid4())
    assert exc.value.status_code == 403

@pytest.mark.asyncio
async def test_get_identity_success():
    db = AsyncMock()
    space_id = uuid4()
    owner_id = uuid4()
    
    mock_space = Space(id=space_id, owner_user_id=owner_id, display_name="Test Space", slug="test-space", logo_url="https://example.com/logo.png")
    mock_y_space = YulloSpace(space_id=space_id, purpose="personal", context_version=3)
    mock_y_config = YulloConfig(space_id=space_id, settings={
        "identity": {
            "description": "About test space",
            "description_source": "owner",
            "category": "Studio",
            "presence": "online",
            "website": "https://example.com"
        }
    })
    
    db.scalar.side_effect = [mock_space, mock_space, mock_y_space, mock_y_config, None]
    
    identity = await get_identity(db, space_id=space_id, user_id=owner_id)
    assert identity.display_name == "Test Space"
    assert identity.slug == "test-space"
    # Normalization check: personal -> person
    assert identity.purpose == SpacePurpose.person
    assert identity.category == "Studio"
    assert identity.presence == "online"
    assert identity.revision == 3

@pytest.mark.asyncio
async def test_update_identity_stale_revision():
    db = AsyncMock()
    space_id = uuid4()
    owner_id = uuid4()
    
    mock_space = Space(id=space_id, owner_user_id=owner_id, display_name="Test Space", slug="test-space")
    mock_y_space = YulloSpace(space_id=space_id, purpose="person", context_version=3)
    mock_y_config = YulloConfig(space_id=space_id, settings={})
    
    db.scalar.side_effect = [mock_space, mock_space, mock_y_space, mock_y_config]
    
    update_data = IdentityFormUpdate(
        display_name="Updated Space",
        expected_revision=1 # Stale revision!
    )
    
    with pytest.raises(HTTPException) as exc:
        await update_identity(db, space_id=space_id, user_id=owner_id, data=update_data)
    assert exc.value.status_code == 409
    assert "stale" in exc.value.detail.lower()

@pytest.mark.asyncio
async def test_delete_or_archive_space_archive():
    from app.yullo.services.persistence.identity import delete_or_archive_space
    db = AsyncMock()
    db.begin_nested = MagicMock(return_value=AsyncMock())
    space_id = uuid4()
    owner_id = uuid4()

    mock_space = Space(id=space_id, owner_user_id=owner_id, display_name="Test Space", slug="test-space", product="yullo", status="live", active=True)
    db.scalar.side_effect = [mock_space.owner_user_id, mock_space, None]

    res = await delete_or_archive_space(db, space_id=space_id, user_id=owner_id, action="archive")
    assert res["status"] == "ok"
    assert res["action"] == "archive"
    assert mock_space.status == "archived"
    assert mock_space.active is False
    db.commit.assert_called_once()

@pytest.mark.asyncio
async def test_delete_or_archive_space_delete():
    from app.yullo.services.persistence.identity import delete_or_archive_space
    db = AsyncMock()
    space_id = uuid4()
    owner_id = uuid4()

    mock_space = Space(id=space_id, owner_user_id=owner_id, display_name="Test Space", slug="test-space", product="yullo", status="live", active=True)
    db.scalar.side_effect = [mock_space.owner_user_id, mock_space, None]

    res = await delete_or_archive_space(db, space_id=space_id, user_id=owner_id, action="delete")
    assert res["status"] == "ok"
    assert res["action"] == "delete"
    db.delete.assert_called_once_with(mock_space)
    db.commit.assert_called_once()

@pytest.mark.asyncio
async def test_delete_or_archive_space_not_found():
    from app.yullo.services.persistence.identity import delete_or_archive_space
    db = AsyncMock()
    db.scalar.return_value = None

    with pytest.raises(HTTPException) as exc:
        await delete_or_archive_space(db, space_id=uuid4(), user_id=uuid4(), action="delete")
    assert exc.value.status_code == 404

@pytest.mark.asyncio
async def test_delete_or_archive_space_invalid_action():
    from app.yullo.services.persistence.identity import delete_or_archive_space
    db = AsyncMock()
    mock_space = Space(id=uuid4(), owner_user_id=uuid4(), product="yullo")
    db.scalar.side_effect = [mock_space.owner_user_id, mock_space, None]

    with pytest.raises(HTTPException) as exc:
        await delete_or_archive_space(db, space_id=mock_space.id, user_id=mock_space.owner_user_id, action="destroy")
    assert exc.value.status_code == 400


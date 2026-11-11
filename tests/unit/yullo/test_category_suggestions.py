import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from app.yullo.services.persistence.identity import list_category_suggestions, record_category_usage
from app.models.yullo_category_suggestion import YulloCategorySuggestion


@pytest.mark.asyncio
async def test_record_category_usage_increments_existing():
    db = AsyncMock()
    existing = YulloCategorySuggestion(
        id=uuid4(),
        name="E-commerce",
        purpose="business",
        is_popular=True,
        usage_count=5
    )
    db.scalar.return_value = existing

    await record_category_usage(db, "e-commerce", "business")
    assert existing.usage_count == 6


@pytest.mark.asyncio
async def test_record_category_usage_creates_new():
    db = AsyncMock()
    db.scalar.return_value = None

    await record_category_usage(db, "Space Robotics", "business")
    db.add.assert_called_once()
    added_obj = db.add.call_args[0][0]
    assert isinstance(added_obj, YulloCategorySuggestion)
    assert added_obj.name == "Space Robotics"
    assert added_obj.purpose == "business"
    assert added_obj.usage_count == 1


@pytest.mark.asyncio
async def test_list_category_suggestions():
    db = AsyncMock()
    items = [
        YulloCategorySuggestion(id=uuid4(), name="E-commerce & Retail", purpose="business", is_popular=True, usage_count=10),
        YulloCategorySuggestion(id=uuid4(), name="SaaS & Software", purpose="business", is_popular=True, usage_count=8),
    ]
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = items
    db.scalars.return_value = mock_scalars

    res = await list_category_suggestions(db, query="commerce", purpose="business", limit=10)
    assert len(res) == 2
    assert res[0].name == "E-commerce & Retail"
    db.scalars.assert_called_once()

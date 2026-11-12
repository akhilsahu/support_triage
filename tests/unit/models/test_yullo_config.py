import uuid
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.space import Space
from app.models.yullo_config import YulloConfig

pytestmark = pytest.mark.asyncio


async def test_yullo_config_lifecycle(db_session: AsyncSession):
    # 1. Create a Space
    space_id = uuid.uuid4()
    space = Space(
        id=space_id,
        slug=f"yullo-conf-{uuid.uuid4().hex[:6]}",
        display_name="Yullo Config Test",
        email=f"yullo-test-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="yullo",
    )
    db_session.add(space)
    await db_session.flush()

    # 2. Attach YulloConfig
    config = YulloConfig(
        space_id=space_id,
        settings={"theme": "dark", "features": ["foo", "bar"]}
    )
    db_session.add(config)
    await db_session.flush()

    # 3. Test relationship
    assert space.yullo_config is not None
    assert space.yullo_config.settings["theme"] == "dark"
    assert config.space.product == "yullo"

    # 4. Test cascade delete
    await db_session.delete(space)
    await db_session.flush()

    result = await db_session.execute(select(YulloConfig).where(YulloConfig.space_id == space_id))
    assert result.scalars().first() is None

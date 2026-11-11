import pytest
from httpx import AsyncClient
from app.main import app
from app.models.space import Space
import uuid

pytestmark = pytest.mark.asyncio(loop_scope="session")

async def test_yullo_public_space_isolation(db_session):
    """
    Test that a Yullo space is exposed on public API, but Support247 space is not.
    """
    # This is a basic isolation regression test placeholder.
    pass

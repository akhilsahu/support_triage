"""Isolated database wiring for the existing PostgreSQL-backed tests."""
import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


@pytest.fixture(scope="session")
def test_database():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url or url != os.environ.get("DATABASE_URL"):
        pytest.fail("Set TEST_DATABASE_URL and DATABASE_URL to the same isolated test database")
    parsed = make_url(url)
    if not (parsed.database or "").endswith(("_ci", "_test")):
        pytest.fail("The isolated database name must end in _ci or _test")

    import app.models  # noqa: F401 — register current model constraints
    from app.core.database import Base

    engine = create_engine(parsed.set(drivername="postgresql+psycopg2"))
    try:
        Base.metadata.create_all(engine)
        yield
    finally:
        engine.dispose()


@pytest.fixture
async def db_session(test_database):
    from app.core.database import engine

    async with engine.connect() as connection:
        transaction = await connection.begin()
        factory = async_sessionmaker(
            bind=connection, class_=AsyncSession, expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            async with factory() as session:
                yield session
        finally:
            await transaction.rollback()


@pytest.fixture
async def db_session_fixture(db_session):
    return db_session

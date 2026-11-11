import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from app.core.database import engine
from app.models.space import Space

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


async def test_supported_product_values(db_session: AsyncSession):
    # Test valid product support247
    space = Space(
        id=uuid.uuid4(),
        slug=f"valid-slug-support-{uuid.uuid4().hex[:6]}",
        display_name="Valid Support Space",
        email=f"test-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="support247",
    )
    db_session.add(space)
    await db_session.flush()

    # Test valid product yullo
    space2 = Space(
        id=uuid.uuid4(),
        slug=f"valid-slug-yullo-{uuid.uuid4().hex[:6]}",
        display_name="Valid Yullo Space",
        email=f"test2-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="yullo",
    )
    db_session.add(space2)
    await db_session.flush()

    # Test unknown product
    space3 = Space(
        id=uuid.uuid4(),
        slug="invalid-slug",
        display_name="Invalid Space",
        email=f"invalid-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="unknown_product",
    )
    db_session.add(space3)
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_duplicate_slugs_across_products_allowed(db_session: AsyncSession):
    slug = f"shared-slug-{uuid.uuid4().hex[:6]}"
    
    space1 = Space(
        id=uuid.uuid4(),
        slug=slug,
        display_name="Support Space",
        email=f"test3-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="support247",
    )
    db_session.add(space1)
    await db_session.flush()

    space2 = Space(
        id=uuid.uuid4(),
        slug=slug,
        display_name="Yullo Space",
        email=f"test4-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="yullo",
    )
    db_session.add(space2)
    # This should succeed since they are in different products
    await db_session.flush()


async def test_duplicate_slugs_within_one_product_rejected(db_session: AsyncSession):
    slug = f"rejected-slug-{uuid.uuid4().hex[:6]}"
    
    space1 = Space(
        id=uuid.uuid4(),
        slug=slug,
        display_name="Space 1",
        email=f"test5-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="support247",
    )
    db_session.add(space1)
    await db_session.flush()

    space2 = Space(
        id=uuid.uuid4(),
        slug=slug,
        display_name="Space 2",
        email=f"test6-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fakehash",
        product="support247",
    )
    db_session.add(space2)
    
    # This should fail due to unique constraint on (product, slug)
    with pytest.raises(IntegrityError):
        await db_session.flush()

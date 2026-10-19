import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import AsyncSessionLocal
from app.core.auth import current_user
from app.models.space import Space
from app.models.user import User

@pytest.mark.asyncio
async def test_delete_and_archive_endpoints():
    user_id = uuid.uuid4()
    space1_id = uuid.uuid4()
    space2_id = uuid.uuid4()

    async with AsyncSessionLocal() as session:
        # Create a test user
        user = User(id=user_id, email=f"user-{user_id.hex[:6]}@example.com")
        session.add(user)

        # Create space 1 (to archive)
        space1 = Space(
            id=space1_id,
            owner_user_id=user_id,
            slug=f"space-arch-{space1_id.hex[:6]}",
            product="yullo",
            display_name="Space To Archive",
            email=f"space1-{space1_id.hex[:6]}@example.com",
            password_hash="pwd",
            status="live",
            active=True
        )
        session.add(space1)

        # Create space 2 (to delete)
        space2 = Space(
            id=space2_id,
            owner_user_id=user_id,
            slug=f"space-del-{space2_id.hex[:6]}",
            product="yullo",
            display_name="Space To Delete",
            email=f"space2-{space2_id.hex[:6]}@example.com",
            password_hash="pwd",
            status="live",
            active=True
        )
        session.add(space2)

        await session.commit()

    # Override current_user dependency to mock authenticated user
    app.dependency_overrides[current_user] = lambda: user

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Test Archive endpoint via /api/v1/yullo/spaces/{space_id}?action=archive
            res_arch = await ac.delete(f"/api/v1/yullo/spaces/{space1_id}?action=archive")
            assert res_arch.status_code == 200, res_arch.text
            data = res_arch.json()
            assert data["status"] == "ok"
            assert data["action"] == "archive"

            # Verify in DB that space1 is archived
            async with AsyncSessionLocal() as session:
                s1 = await session.get(Space, space1_id)
                assert s1 is not None
                assert s1.status == "archived"
                assert s1.active is False

            # 2. Test Delete endpoint via /api/v1/yullo/onboarding/spaces/{space_id}?action=delete
            res_del = await ac.delete(f"/api/v1/yullo/onboarding/spaces/{space2_id}?action=delete")
            assert res_del.status_code == 200, res_del.text
            data = res_del.json()
            assert data["status"] == "ok"
            assert data["action"] == "delete"

            # Verify in DB that space2 is completely removed
            async with AsyncSessionLocal() as session:
                s2 = await session.get(Space, space2_id)
                assert s2 is None
    finally:
        app.dependency_overrides.pop(current_user, None)
        # Cleanup space1 and user
        async with AsyncSessionLocal() as session:
            s1_db = await session.get(Space, space1_id)
            if s1_db:
                await session.delete(s1_db)
            s2_db = await session.get(Space, space2_id)
            if s2_db:
                await session.delete(s2_db)
            u_db = await session.get(User, user_id)
            if u_db:
                await session.delete(u_db)
            await session.commit()

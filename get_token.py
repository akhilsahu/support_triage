import asyncio
from app.core.database import AsyncSessionLocal
from app.models.space import Space
from app.core.auth import create_token
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Space).limit(1))
        space = result.scalar_one_or_none()
        if space:
            print(create_token({"sub": str(space.id), "slug": space.slug, "tv": space.token_version}))
        else:
            print("Space not found")

asyncio.run(main())

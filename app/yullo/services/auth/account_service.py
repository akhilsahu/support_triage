from datetime import timezone
from uuid import UUID

import structlog
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.yullo.schemas.account import AccountProfileUpdate

logger = structlog.get_logger()


def profile_payload(user: User) -> dict:
    return {"user": {**user.to_dict(), "updated_at": user.updated_at.isoformat()}}


async def update_profile(db: AsyncSession, *, user_id: UUID, data: AccountProfileUpdate) -> dict:
    account = await db.scalar(
        select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True)
    )
    if account is None:
        raise HTTPException(404, "Account not found")

    # The existing updated_at column provides revision checks without a migration.
    actual = account.updated_at
    actual = actual.replace(tzinfo=timezone.utc) if actual.tzinfo is None else actual.astimezone(timezone.utc)
    expected = data.expected_updated_at
    expected = expected.replace(tzinfo=timezone.utc) if expected.tzinfo is None else expected.astimezone(timezone.utc)
    if actual != expected:
        logger.info("yullo.account.update_conflict", user_id=str(user_id))
        raise HTTPException(409, "Account changed. Reload the latest details and try again.")

    account.full_name = data.full_name or None
    await db.commit()
    await db.refresh(account)
    logger.info("yullo.account.updated", user_id=str(user_id))
    return profile_payload(account)

"""Search published identities without reading knowledge, tools or conversations."""
import logging
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.models.yullo_space import YulloSpace
from app.yullo.schemas.directory import PublicSpaceDirectory, PublicSpaceIcon
from app.yullo.services.spaces.hierarchy import live_branch_path

logger = logging.getLogger(__name__)


async def browse_public_spaces(
    db: AsyncSession, *, query: str = "", cursor: UUID | None = None, limit: int = 48,
) -> PublicSpaceDirectory:
    statement = select(Space, YulloSpace).join(YulloSpace, YulloSpace.space_id == Space.id).where(
        Space.product == "yullo", Space.active.is_(True), Space.status == "live",
        YulloSpace.lifecycle_status == "live",
    )
    if query:
        # Treat wildcard characters as literal search text.
        pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        statement = statement.where(or_(
            Space.display_name.ilike(pattern, escape="\\"), Space.slug.ilike(pattern, escape="\\"),
        ))
    if cursor:
        statement = statement.where(Space.id > cursor)
    try:
        rows = (await db.execute(statement.order_by(Space.id).limit(limit + 1))).all()
    except Exception as error:
        logger.error("yullo.directory.failed", extra={"error_type": type(error).__name__})
        raise
    items, ancestors = [], {}
    for space, extension in rows[:limit]:
        # Private, archived, foreign-owner or cyclic ancestors make a child ineligible.
        path = await live_branch_path(db, space, extension, ancestor_cache=ancestors)
        if path:
            items.append(PublicSpaceIcon(
                id=space.id, name=space.display_name, handle=space.slug,
                icon_url=space.logo_url, url=path,
            ))
    next_cursor = rows[limit - 1][0].id if len(rows) > limit else None
    logger.info("yullo.directory.browsed", extra={"result_count": len(items), "has_more": next_cursor is not None})
    return PublicSpaceDirectory(items=items, next_cursor=next_cursor)

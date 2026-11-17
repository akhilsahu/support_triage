"""Read-only deployment check: python -m app.yullo.services.home.schema_check."""

import asyncio

from sqlalchemy import inspect, select

from app.core.database import engine
from app.yullo.services.home.repository import (
    ConversationEvent,
    ConversationTurn,
    KBFact,
    KnowledgeBaseItem,
    Space,
    YulloHomeEvent,
    YulloSpace,
    YulloSpaceEntity,
    YulloSpaceEntityEvidence,
    YulloUserPreference,
)


async def check_home_schema() -> None:
    async with engine.connect() as conn:
        async with conn.begin():
            await conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            await conn.exec_driver_sql("SET LOCAL statement_timeout = '15s'")
            # LIMIT 0 validates mapped columns without loading owner or source data.
            for model in (
                Space, YulloSpace, YulloUserPreference, ConversationTurn,
                ConversationEvent, KnowledgeBaseItem, YulloSpaceEntity,
                YulloSpaceEntityEvidence, KBFact, YulloHomeEvent,
            ):
                await conn.execute(select(model.__table__).limit(0))

            indexes = await conn.run_sync(
                lambda c: inspect(c).get_indexes("conversation_events")
            )
            for index in indexes:
                predicate = str(
                    index.get("dialect_options", {}).get("postgresql_where", "")
                ).replace("(", "").replace(")", "").strip().lower()
                if (
                    index["name"] == "uix_conversation_events_space_dedupe"
                    and index["unique"]
                    and index["column_names"] == ["space_id", "dedupe_key"]
                    and predicate == "dedupe_key is not null"
                ):
                    break
            else:
                raise RuntimeError("Conversation event deduplication index is missing or incompatible")


async def main() -> None:
    try:
        await check_home_schema()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

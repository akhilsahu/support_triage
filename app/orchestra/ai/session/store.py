"""
build_session_db — the single Agno `db` that backs conversation history,
user memory, and session summaries.

Pluggable like the knowledge backend: switch via cfg.session_store.
Agno auto-creates its own tables in this database on first use.

    postgres → PostgresDb (own database, separate from the app DB)
    sqlite   → SqliteDb   (local file; dev / standalone)
    none     → None       (native session features disabled)
"""

from __future__ import annotations

from typing import Any, Optional
import asyncio
import time
from functools import lru_cache

import structlog

from app.orchestra.ai.config import OrchestraConfig

logger = structlog.get_logger()


def _postgres_reachable(url: str) -> bool:
    """Cheap SELECT 1 preflight so a missing/unreachable session DB fails fast."""
    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(url, pool_pre_ping=True)
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        finally:
            engine.dispose()
    except Exception as e:
        logger.warning("session.db.preflight_failed", error=str(e))
        return False


def build_session_db(cfg: OrchestraConfig) -> Optional[Any]:
    store = (cfg.session_store or "none").strip().lower()

    if store == "none":
        return None

    try:
        if store == "postgres":
            if not cfg.session_db_url:
                logger.warning("session.db.no_url", store=store)
                return None
            
            # Agno's PostgresDb and our preflight check both require a sync driver (psycopg2).
            # If the user passed an asyncpg URL (e.g. from DATABASE_URL), strip it so it defaults to sync.
            sync_url = cfg.session_db_url.replace("+asyncpg", "")

            # PostgresDb construction is lazy — it does NOT connect. A missing or
            # unreachable `agno_sessions` database would otherwise surface only at
            # first history/memory access inside arun(), which the orchestrator
            # turns into a generic fallback reply (chat appears broken). Preflight
            # the connection here: on failure, degrade to stateless (return None,
            # loud error) so chat keeps working without session persistence.
            if not _postgres_reachable(sync_url):
                logger.error("session.db.unreachable", store="postgres",
                             hint="create the agno_sessions database or set SESSION_STORE=none")
                return None
            from agno.db.postgres import PostgresDb
            db = PostgresDb(db_url=sync_url, db_schema=cfg.session_db_schema)
            logger.info("session.db.ready", store="postgres", schema=cfg.session_db_schema)
            return db

        if store == "sqlite":
            from agno.db.sqlite import SqliteDb
            db_file = cfg.session_db_url or ".agno_sessions.db"
            db = SqliteDb(db_file=db_file)
            logger.info("session.db.ready", store="sqlite", db_file=db_file)
            return db

        logger.warning("session.db.unknown_store", store=store)
    except ImportError:
        logger.warning("session.db.missing_dep", store=store)
    except Exception as e:
        logger.error("session.db.init_error", store=store, error=str(e))
    return None


def session_runner_kwargs(cfg: OrchestraConfig, db: Optional[Any], memory: Optional[Any]) -> dict:
    """
    Native Agno session knobs for a conversational runner (Team leader or a
    standalone single Agent). Same param names on Agent and Team.

    Returns {} when there's no db — without it Agno has nowhere to persist
    history/memories/summaries, so enabling the flags would be a no-op.

    Note: session_id and user_id are NOT set here — they are per-request and
    passed to run()/arun(), since one runner instance serves many sessions.
    """
    if db is None:
        return {}
    return {
        "db": db,
        # History
        "add_history_to_context": cfg.history_enabled,
        "num_history_runs": cfg.num_history_runs,
        # User memory (update_memory_on_run is the non-deprecated write flag;
        # add_memories_to_context injects stored memories on read)
        "memory_manager": memory,
        "update_memory_on_run": cfg.user_memories_enabled,
        "add_memories_to_context": cfg.user_memories_enabled,
        # Rolling session summary
        "enable_session_summaries": cfg.session_summaries_enabled,
        "add_session_summary_to_context": cfg.session_summaries_enabled,
    }


@lru_cache(maxsize=8)
def _persistent_history_db(store: str, url: str, schema: str):
    db = build_session_db(OrchestraConfig(
        session_store=store, session_db_url=url, session_db_schema=schema,
    ))
    if db is None:
        # A failed construction is not cached: do not silently lose context.
        raise RuntimeError("Persistent conversation history is unavailable")
    return db


class StagedHistory:
    """Agno-owned history, staged until the application commits its audit rows.

    Caller must serialize each conversation (e.g. lock its application session
    row). Committed audit rows backfill legacy conversations and repair a native
    write lost after an application commit. Uncommitted model runs never reach
    the persistent Agno store. No schema or destructive migration is required.
    """

    @classmethod
    async def open(cls, cfg, *, scope_id, session_id, records, namespace='conversation'):
        from agno.db.in_memory import InMemoryDb
        from agno.db.base import SessionType
        from agno.session.agent import AgentSession

        self = cls()
        self.agent_id = 'prepared-conversation'
        self.user_id = f'{namespace}:{scope_id}'
        self.session_id = f'{namespace}:{scope_id}:{session_id}'
        self.persistent = await asyncio.to_thread(
            _persistent_history_db, cfg.session_store, cfg.session_db_url, cfg.session_db_schema,
        )
        self.session = await asyncio.to_thread(
            self.persistent.get_session, self.session_id,
            session_type=SessionType.AGENT, user_id=self.user_id,
        )
        if self.session is None:
            # Agno defaults these to None, but its persistent schema requires timestamps.
            now = int(time.time())
            self.session = AgentSession(session_id=self.session_id, agent_id=self.agent_id,
                                        user_id=self.user_id, runs=[], created_at=now, updated_at=now)
        if self.session.user_id != self.user_id or self.session.agent_id != self.agent_id:
            raise ValueError('Conversation history scope mismatch')
        self._merge(records)
        # Native history must be readable/writable before generation. This
        # contains committed audit rows only, never the current request.
        saved = await asyncio.to_thread(self.persistent.upsert_session, self.session)
        if saved is None:
            raise RuntimeError('Conversation history backfill failed')
        self.session = saved
        self.db = InMemoryDb()
        self.db.upsert_session(self.session)
        return self

    def _merge(self, records):
        from datetime import timezone
        from agno.models.message import Message
        from agno.run.agent import RunOutput
        from agno.run.base import RunStatus

        covered = {str(value) for run in self.session.runs or []
                   for value in (run.metadata or {}).get('audit_message_ids', [])}
        pending = []

        def append(rows):
            final = rows[-1]
            timestamp = final['timestamp']
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            self.session.upsert_run(RunOutput(
                run_id=str(final['id']), agent_id=self.agent_id,
                session_id=self.session_id, user_id=self.user_id,
                messages=[Message(role=row['role'], content=row['message']) for row in rows],
                content=final['message'] if final['role'] == 'assistant' else None,
                created_at=int(timestamp.timestamp()), status=RunStatus.completed,
                metadata={'audit_message_ids': [str(row['id']) for row in rows]},
            ))

        for record in records:
            if record['role'] not in ('user', 'assistant') or str(record['id']) in covered:
                continue
            pending.append(record)
            if record['role'] == 'assistant':
                append(pending)
                pending = []
        # Preserve committed unanswered user messages without inventing replies.
        for record in pending:
            append([record])

    def messages(self):
        return [message for run in self.session.runs or [] for message in run.messages or []
                if message.role in ('user', 'assistant')]

    async def publish(self, committed_records):
        # Publish delivered text only. Tool results and source evidence must not
        # leak into later requests after source permissions/publication change.
        self._merge(committed_records)
        saved = await asyncio.to_thread(self.persistent.upsert_session, self.session)
        if saved is None:
            raise RuntimeError('Conversation history synchronization failed')
        self.session = saved

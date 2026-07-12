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

import structlog

from app.orchestra.ai.core.config import AgnoConfig

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


def build_session_db(cfg: AgnoConfig) -> Optional[Any]:
    store = (cfg.session_store or "none").strip().lower()

    if store == "none":
        return None

    try:
        if store == "postgres":
            if not cfg.session_db_url:
                logger.warning("session.db.no_url", store=store)
                return None
            # PostgresDb construction is lazy — it does NOT connect. A missing or
            # unreachable `agno_sessions` database would otherwise surface only at
            # first history/memory access inside arun(), which the orchestrator
            # turns into a generic fallback reply (chat appears broken). Preflight
            # the connection here: on failure, degrade to stateless (return None,
            # loud error) so chat keeps working without session persistence.
            if not _postgres_reachable(cfg.session_db_url):
                logger.error("session.db.unreachable", store="postgres",
                             hint="create the agno_sessions database or set SESSION_STORE=none")
                return None
            from agno.db.postgres import PostgresDb
            db = PostgresDb(db_url=cfg.session_db_url, db_schema=cfg.session_db_schema)
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


def session_runner_kwargs(cfg: AgnoConfig, db: Optional[Any], memory: Optional[Any]) -> dict:
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

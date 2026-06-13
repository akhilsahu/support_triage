"""
SessionPool — session-scoped agent/team cache.

Lifecycle:
  Chatbox open  → pool.get_or_init()   — builds Team/Agent once, caches by session_id
  Each message  → pool.get()           — returns cached runner (zero rebuild cost)
  Chatbox close → pool.destroy()       — evicts from cache immediately
  Idle > TTL    → pool.sweep_expired() — auto-evict (background task in main.py)

Design:
  - asyncio.Lock per session prevents double-build on concurrent first messages
  - TTL driven by AgnoConfig.session_ttl_seconds (default 30 min)
  - Process-local — fine for multi-worker deploys since Agno loads conversation
    history from Postgres per session_id regardless

Extending:
  - Subclass SessionPool and override _build() to use a different orchestrator
  - Add Redis-backed get/set to share pool state across workers
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.core.config import AgnoConfig

logger = structlog.get_logger()


class SessionPool:
    """
    Singleton-style session-scoped agent pool.

    Use the module-level `pool` instance:
        from app.orchestra.ai.session.pool import pool
        runner = await pool.get_or_init(session_id, ...)
    """

    def __init__(self, ttl_seconds: int = 1800):
        self._pool:      Dict[str, Any]               = {}
        self._agents:    Dict[str, List[ResolvedAgent]] = {}  # "{space_id}:agents"
        self._last_used: Dict[str, float]              = {}
        self._locks:     Dict[str, asyncio.Lock]       = {}
        self.ttl_seconds = ttl_seconds

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_or_init(
        self,
        session_id:    str,
        active_agents: List[ResolvedAgent],
        space_id:        str,
        org_name:      str                  = "Support",
        cfg:           Optional[AgnoConfig] = None,
        mcp_server:    Optional[Any]        = None,
        skills_map:    Optional[Dict[str, List[Any]]] = None,
    ) -> Optional[Any]:
        """
        Return cached runner or build one for a new session.
        Concurrent first-messages for the same session are serialised via Lock.
        """
        if session_id in self._pool:
            self._touch(session_id)
            return self._pool[session_id]

        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()

        async with self._locks[session_id]:
            if session_id in self._pool:          # re-check after acquiring lock
                self._touch(session_id)
                return self._pool[session_id]

            from app.orchestra.ai.core.config import build_config
            resolved_cfg = cfg or build_config()

            runner = await self._build(
                session_id=session_id,
                active_agents=active_agents,
                space_id=space_id,
                org_name=org_name,
                cfg=resolved_cfg,
                mcp_server=mcp_server,
                skills_map=skills_map or {},
            )

            if runner:
                self._pool[session_id] = runner
                self._touch(session_id)
                logger.info(
                    "session_pool.init",
                    session_id=session_id,
                    space_id=space_id,
                    agents=[a.slug for a in active_agents if a.slug != "triage"],
                    ttl=self.ttl_seconds,
                )

            return runner

    def get(self, session_id: str) -> Optional[Any]:
        """Return cached runner (None if not initialised). Updates TTL."""
        runner = self._pool.get(session_id)
        if runner:
            self._touch(session_id)
        return runner

    # ── Agent list cache (per space) ──────────────────────────────────────────

    def get_agents(self, space_id: str) -> Optional[List[ResolvedAgent]]:
        """Return cached active-agent list for this space, or None if stale/missing."""
        key = f"{space_id}:agents"
        agents = self._agents.get(key)
        if agents is None:
            return None
        ts = self._last_used.get(key, 0)
        if time.monotonic() - ts > self.ttl_seconds:
            self._agents.pop(key, None)
            self._last_used.pop(key, None)
            return None
        return agents

    def set_agents(self, space_id: str, agents: List[ResolvedAgent]) -> None:
        """Cache the active-agent list for this space."""
        key = f"{space_id}:agents"
        self._agents[key] = agents
        self._last_used[key] = time.monotonic()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def destroy(self, session_id: str) -> None:
        """Evict a single entry by key. Safe to call if key not in pool."""
        self._pool.pop(session_id, None)
        self._last_used.pop(session_id, None)
        self._locks.pop(session_id, None)
        logger.info("session_pool.destroy", session_id=session_id)

    def invalidate_bot_agents(self, space_id: str) -> int:
        """
        Evict Team runner + cached agent list for a space.

        Call whenever agent config changes (prompt update, enable/disable,
        create, delete) so the next request rebuilds from fresh DB data.

        Returns the number of runner entries evicted.
        """
        prefix = f"{space_id}:"
        stale  = [key for key in list(self._pool) if key.startswith(prefix)]
        for key in stale:
            self.destroy(key)
        # Also clear the agent list cache
        agents_key = f"{space_id}:agents"
        if agents_key in self._agents:
            self._agents.pop(agents_key, None)
            self._last_used.pop(agents_key, None)
        logger.info("session_pool.invalidate_bot", space_id=space_id, evicted=len(stale))
        return len(stale)

    def size(self) -> int:
        """Active session count — for health checks / metrics."""
        return len(self._pool)

    async def sweep_expired(self) -> int:
        """
        Evict sessions and agent caches idle longer than ttl_seconds.
        Called every 10 min by the background task in main.py.
        """
        cutoff  = time.monotonic() - self.ttl_seconds
        expired = [sid for sid, t in self._last_used.items() if t < cutoff]
        for sid in expired:
            if sid in self._pool:
                self.destroy(sid)
            elif sid in self._agents:
                self._agents.pop(sid, None)
                self._last_used.pop(sid, None)
        if expired:
            logger.info("session_pool.sweep", evicted=len(expired))
        return len(expired)

    # ── Private ───────────────────────────────────────────────────────────────

    def _touch(self, session_id: str) -> None:
        self._last_used[session_id] = time.monotonic()

    async def _build(
        self,
        session_id:    str,
        active_agents: List[ResolvedAgent],
        space_id:        str,
        org_name:      str,
        cfg:           AgnoConfig,
        mcp_server:    Optional[Any],
        skills_map:    Optional[Dict[str, List[Any]]] = None,
    ) -> Optional[Any]:
        """Assemble tools + memory + team. Called exactly once per session."""

        tools = []
        if cfg.tools_enabled and mcp_server:
            try:
                from app.orchestra.ai.factories.tools import ToolFactory
                tools = ToolFactory(cfg).build_from_mcp_server(mcp_server)
            except Exception:
                logger.exception("session_pool.tools_failed", session_id=session_id)

        memory = None
        if cfg.memory_enabled:
            try:
                from app.orchestra.ai.factories.memory import MemoryFactory
                memory = MemoryFactory(cfg).build(session_id)
            except Exception:
                logger.exception("session_pool.memory_failed", session_id=session_id)

        try:
            from app.orchestra.ai.factories.team import TeamFactory
            return TeamFactory(cfg, space_id).build(
                active_agents=active_agents,
                org_name=org_name,
                tools=tools,
                memory=memory,
                skills_map=skills_map or {},
            )
        except Exception:
            logger.exception("session_pool.team_failed", session_id=session_id)
            return None


# ── Module-level singleton ────────────────────────────────────────────────────

pool = SessionPool(ttl_seconds=1800)

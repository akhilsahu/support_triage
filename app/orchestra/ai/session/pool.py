"""
SessionPool — bot-level Team/Agent cache.

One runner per space ({space_id}:team), shared across ALL customer sessions.
Session history isolation is Agno's job (per session_id in arun()).

Lifecycle:
  /session/init    → get_or_init()        — builds Team once, caches it
  each message     → get_or_init()        — returns cached runner instantly
  agent config change → invalidate_bot_agents() — evict + rebuild on next request
  idle > TTL       → sweep_expired()      — background cleanup (main.py every 10 min)
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

    def __init__(self, ttl_seconds: int = 1800):
        self._runners:   Dict[str, Any]               = {}
        self._agents:    Dict[str, List[ResolvedAgent]] = {}  # {space_id}:agents
        self._last_used: Dict[str, float]              = {}
        self._locks:     Dict[str, asyncio.Lock]       = {}
        self.ttl_seconds = ttl_seconds

    # ── Runner cache ──────────────────────────────────────────────────────────

    async def get_or_init(
        self,
        session_id:        str,
        active_agents:     List[ResolvedAgent],
        space_id:          str,
        org_name:          str                        = "Support",
        cfg:               Optional[AgnoConfig]       = None,
        mcp_server:        Optional[Any]              = None,
        skills_map:        Optional[Dict[str, List[Any]]] = None,
        knowledge_backend: Optional[Any]              = None,
        leader:            Optional[ResolvedAgent]    = None,  # triage → Team config
        clarify_enabled:   bool                       = False,  # Chatbot.clarify_enabled
    ) -> Optional[Any]:
        """Return cached Team/Agent or build it once on first call."""
        if session_id in self._runners:
            self._last_used[session_id] = time.monotonic()
            return self._runners[session_id]

        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()

        async with self._locks[session_id]:
            if session_id in self._runners:   # re-check after lock
                self._last_used[session_id] = time.monotonic()
                return self._runners[session_id]

            from app.orchestra.ai.core.config import build_config
            from app.orchestra.ai.factories.team import TeamFactory

            runner = None
            try:
                runner = TeamFactory.build_for_pool(
                    cfg=cfg or build_config(),
                    space_id=space_id,
                    knowledge_backend=knowledge_backend,
                    session_id=session_id,
                    active_agents=active_agents,
                    org_name=org_name,
                    mcp_server=mcp_server,
                    skills_map=skills_map,
                    leader=leader,
                    clarify_enabled=clarify_enabled,
                )
            except Exception:
                logger.exception("pool.build_failed", session_id=session_id)

            if runner:
                self._runners[session_id] = runner
                self._last_used[session_id] = time.monotonic()
                logger.info("pool.built", session_id=session_id, space_id=space_id,
                            agents=[a.slug for a in active_agents if a.slug != "triage"])

            return runner

    def destroy(self, session_id: str) -> None:
        """Evict one entry. Safe to call if key is absent."""
        self._runners.pop(session_id, None)
        self._last_used.pop(session_id, None)
        self._locks.pop(session_id, None)
        logger.info("pool.destroyed", session_id=session_id)

    def invalidate_bot_agents(self, space_id: str) -> int:
        """
        Evict Team runner + agent list for a space.
        Call when agent config changes so next request rebuilds from DB.
        """
        prefix = f"{space_id}:"
        stale  = [k for k in list(self._runners) if k.startswith(prefix)]
        for key in stale:
            self.destroy(key)
        # Agent-list entries are keyed "{space_id}:{chatbot_id}:agents" — evict every
        # chatbot under this space so each rebuilds from DB on next request.
        for key in [k for k in list(self._agents) if k.startswith(prefix)]:
            self._agents.pop(key, None)
            self._last_used.pop(key, None)
        logger.info("pool.invalidated", space_id=space_id, evicted=len(stale))
        return len(stale)

    def size(self) -> int:
        return len(self._runners)

    async def sweep_expired(self) -> int:
        """Evict entries idle longer than ttl_seconds. Called by background task."""
        cutoff  = time.monotonic() - self.ttl_seconds
        expired = [k for k, t in self._last_used.items() if t < cutoff]
        for key in expired:
            if key in self._runners:
                self.destroy(key)
            else:
                self._agents.pop(key, None)
                self._last_used.pop(key, None)
        if expired:
            logger.info("pool.swept", evicted=len(expired))
        return len(expired)

    # ── Agent list cache (per chatbot, busted by invalidate_bot_agents) ───────
    # cache_key = "{space_id}:{chatbot_id}" so two chatbots in one space keep
    # separate agent sets, while space-level invalidation still clears both.

    def get_agents(self, cache_key: str) -> Optional[List[ResolvedAgent]]:
        key = f"{cache_key}:agents"
        ts  = self._last_used.get(key, 0)
        if time.monotonic() - ts > self.ttl_seconds:
            self._agents.pop(key, None)
            self._last_used.pop(key, None)
            return None
        return self._agents.get(key)

    def set_agents(self, cache_key: str, agents: List[ResolvedAgent]) -> None:
        key = f"{cache_key}:agents"
        self._agents[key]    = agents
        self._last_used[key] = time.monotonic()


# ── Module-level singleton ────────────────────────────────────────────────────

pool = SessionPool(ttl_seconds=1800)

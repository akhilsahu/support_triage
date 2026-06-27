"""
Custom agent builder — builds an Agno Agent from a DB-saved CustomAgent.

Reuses:
  - Existing ChromaDB collection + embeddings — no re-indexing
  - ResolvedAgent.from_custom() factory — same data model
  - db_utils/agent_loader.py for all DB access

Usage:
    resolved   = await load_custom_agent_by_slug(db, space_id, "samsung-s25-support")
    agno_agent = CustomAgentBuilder(cfg).build(resolved, space_id=str(org.id))
    response   = await agno_agent.arun("What is the battery life?")
"""

from __future__ import annotations
from typing import Any, List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.core.config import AgnoConfig, build_config
from app.orchestra.ai.factories.agent import AgentFactory

logger = structlog.get_logger()


class CustomAgentBuilder:
    """
    Builds standalone Agno Agents from DB-saved CustomAgent records.

    Uses AgentFactory internally — RAG, memory, and tools wired the same
    way as in the main orchestration pipeline.
    """

    def __init__(self, cfg: Optional[AgnoConfig] = None):
        self.cfg = cfg or build_config()

    def build(
        self,
        resolved:    ResolvedAgent,
        space_id:      str,
        extra_tools: Optional[List[Any]] = None,
        memory:      Optional[Any]       = None,
    ) -> Optional[Any]:
        """
        Build a standalone Agno Agent from a ResolvedAgent (custom type).

        Args:
            resolved:    ResolvedAgent from db_utils.agent_loader
            space_id:      str(org.id) — scopes ChromaDB search
            extra_tools: Additional tools to attach
            memory:      Agno Memory object for session context
        """
        cfg = build_config(
            temperature=resolved.temperature,
            max_tokens=resolved.max_tokens,
            rag_top_k=resolved.rag_top_k,
        ) if self.cfg is None else self.cfg

        agent = AgentFactory(cfg, space_id).build(
            resolved=resolved,
            tools=extra_tools or [],
            memory=memory,
        )

        if agent:
            logger.info(
                "custom_agent.built",
                slug=resolved.slug,
                name=resolved.name,
                rag_enabled=resolved.rag_enabled,
                doc_types=resolved.rag_doc_types_list,
            )
        return agent

    async def build_from_db(
        self,
        db,
        space_id,
        slug:        str,
        extra_tools: Optional[List[Any]] = None,
        memory:      Optional[Any]       = None,
    ) -> Optional[Any]:
        """
        End-to-end: load CustomAgent from DB + build Agno Agent in one call.

        Args:
            db:     AsyncSession
            space_id: UUID of the org
            slug:   CustomAgent slug (e.g. "samsung-s25-support")
        """
        from app.orchestra.ai.db_utils.agent_loader import load_custom_agent_by_slug

        resolved = await load_custom_agent_by_slug(db, space_id, slug)
        if not resolved:
            return None

        return self.build(
            resolved=resolved,
            space_id=str(space_id),
            extra_tools=extra_tools,
            memory=memory,
        )

"""
TeamFactory — builds Agno Team or single Agent from a ResolvedAgent list.

Routing strategy (smart triage):
  1 specialist  → return Agent directly   (no team overhead)
  2+ specialists:
    - Default mode: route (triage picks one specialist per message)
    - Triage instructions tell it to respond with:
        {"mode": "coordinate", "agents": ["finance", "logistics"]}
      when it detects a multi-domain query. The AgnoOrchestrator
      handles switching to coordinate mode dynamically.

  team_mode = "route"      — Agno picks one specialist per message  (default)
  team_mode = "coordinate" — all specialists contribute to one reply

Triage agent (slug="triage") is used as the Team leader when present in
active_agents. If absent, agno's built-in Team routing is used directly.
"""

from __future__ import annotations
from typing import Any, List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.core.config import AgnoConfig
from app.orchestra.ai.factories.agent import AgentFactory
from app.orchestra.ai.factories.llm import LLMFactory
from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend
from app.orchestra.ai.knowledge.null import NullKnowledgeBackend
from app.orchestra.ai.prompts import TRIAGE_COORDINATOR_PROMPT

logger = structlog.get_logger()


class TeamFactory:
    """
    Builds Agno Team from a list of ResolvedAgents.

    The triage agent (slug="triage"), when present, is used as the Team
    leader with smart routing instructions. Specialists become Team members.
    """

    def __init__(
        self,
        cfg:               AgnoConfig,
        space_id:          str,
        knowledge_backend: BaseKnowledgeBackend | None = None,
    ):
        self.cfg           = cfg
        self.space_id      = space_id
        self.llm_factory   = LLMFactory(cfg)
        self.agent_factory = AgentFactory(cfg, space_id, knowledge_backend or NullKnowledgeBackend())

    @classmethod
    def build_for_pool(
        cls,
        cfg:               AgnoConfig,
        space_id:          str,
        knowledge_backend: BaseKnowledgeBackend | None,
        session_id:        str,
        active_agents:     List[ResolvedAgent],
        org_name:          str,
        mcp_server:        Optional[Any] = None,
        skills_map:        Optional[dict] = None,
    ) -> Optional[Any]:
        """
        Full build entry point called by SessionPool._build().

        Owns tools + memory setup so pool stays a pure cache.
        Tools and memory are lazy-imported to keep startup fast.
        """
        tools: List[Any] = []
        if cfg.tools_enabled and mcp_server:
            try:
                from app.orchestra.ai.factories.tools import ToolFactory
                tools = ToolFactory(cfg).build_from_mcp_server(mcp_server)
            except Exception:
                logger.exception("team_factory.tools_failed", space_id=space_id)

        memory = None
        if cfg.user_memories_enabled:
            try:
                from app.orchestra.ai.factories.memory import MemoryFactory
                memory = MemoryFactory(cfg).build(session_id)
            except Exception:
                logger.exception("team_factory.memory_failed", space_id=space_id)

        # One Agno session db per space runner — backs history/memory/summaries.
        db = None
        try:
            from app.orchestra.ai.session.store import build_session_db
            db = build_session_db(cfg)
        except Exception:
            logger.exception("team_factory.session_db_failed", space_id=space_id)

        return cls(cfg, space_id, knowledge_backend).build(
            active_agents=active_agents,
            org_name=org_name,
            tools=tools,
            memory=memory,
            skills_map=skills_map or {},
            db=db,
        )

    def build(
        self,
        active_agents: List[ResolvedAgent],
        org_name:      str                = "Support",
        tools:         Optional[List[Any]] = None,
        memory:        Optional[Any]       = None,
        skills_map:    Optional[dict]      = None,  # {slug: [PromptSkill, ...]}
        db:            Optional[Any]       = None,  # Agno session db (leader/standalone)
    ) -> Optional[Any]:
        """
        Build Team or Agent from active agents.

        Placement of native session features:
          * single specialist → that Agent IS the conversation → gets db +
            history + memory + summaries (attach_session=True).
          * multiple specialists → the Team leader owns the conversation and
            gets db + history + memory + summaries; members only retrieve.

        Returns:
            Single Agent when only one specialist, Team otherwise.
            Returns None if agno not installed or no specialists found.
        """
        try:
            from agno.team import Team
        except ImportError:
            logger.warning("agno not installed — pip install agno")
            return None

        triage_resolved   = next((a for a in active_agents if a.slug == "triage"), None)
        specialists       = [a for a in active_agents if a.slug != "triage"]

        if not specialists:
            logger.warning("team_factory.no_specialists", space_id=self.space_id)
            return None

        # Single specialist — bare agent that owns the conversation (session attached).
        if len(specialists) == 1:
            agent = self.agent_factory.build(
                specialists[0],
                tools=tools,
                memory=memory,
                skills=(skills_map or {}).get(specialists[0].slug, []),
                db=db,
                attach_session=True,
            )
            if agent:
                logger.info("team_factory.single_agent", slug=specialists[0].slug)
            return agent

        # Multiple specialists — members retrieve only (no session state).
        agno_agents = self.agent_factory.build_all(
            specialists,
            tools=tools,
            memory=None,
            skills_map=skills_map or {},
        )
        if not agno_agents:
            return None

        return self._build_team(agno_agents, specialists, triage_resolved, org_name, memory, db)

    # ── Private ───────────────────────────────────────────────────────────────

    def _build_team(
        self,
        agno_agents:      List[Any],
        specialists:      List[ResolvedAgent],
        triage_resolved:  Optional[ResolvedAgent],
        org_name:         str,
        memory:           Optional[Any],
        db:               Optional[Any] = None,
    ) -> Optional[Any]:
        try:
            from agno.team import Team, TeamMode

            # Build the specialist list description for triage instructions
            specialist_desc = "\n".join(
                f"  - {s.slug}: {s.description or s.name}"
                for s in specialists
            )

            # Triage leader instructions — smart route vs coordinate
            triage_instructions = TRIAGE_COORDINATOR_PROMPT.format(
                specialist_list=specialist_desc
            )
            if triage_resolved and triage_resolved.system_prompt:
                # Allow org-level system_prompt to override the base triage instructions
                triage_instructions = (
                    triage_resolved.system_prompt.strip()
                    + "\n\n"
                    + triage_instructions
                )

            team_kwargs: dict = dict(
                name=f"{org_name} Support Team",
                mode=TeamMode(self.cfg.team_mode.lower()),
                model=self.llm_factory.build(),
                members=agno_agents,
                instructions=triage_instructions,
                show_members_responses=self.cfg.show_members_responses,
                debug_mode=self.cfg.debug,
            )
            # HISTORY / MEMORY / SUMMARY live on the leader (the conversation).
            from app.orchestra.ai.session.store import session_runner_kwargs
            team_kwargs.update(session_runner_kwargs(self.cfg, db, memory))

            team = Team(**team_kwargs)
            logger.info(
                "team_factory.team_built",
                space_id=self.space_id,
                mode=self.cfg.team_mode,
                members=len(agno_agents),
                triage_leader=triage_resolved.slug if triage_resolved else "none",
                session=db is not None,
            )
            return team
        except Exception as e:
            logger.error("team_factory.build_error", error=str(e))
            return None

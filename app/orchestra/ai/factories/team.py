"""
TeamFactory — builds Agno Team or single Agent from a ResolvedAgent list.

Routing strategy:
  1 specialist  → return Agent directly   (no team overhead, no routing)
  2+ specialists → Team, whose leader routes

  team_mode = "route"      — Agno picks one specialist per message  (default)
  team_mode = "coordinate" — all specialists contribute to one reply

Note that route mode is enforced by Agno's instructions, not by code: nothing
prevents the leader delegating to more than one member.

The leader is the Team object itself — Agno has no separate leader agent, so a
triage agent can only supply the Team's instructions (and later its model), via
build(leader=...). It is never a member; that is what made triage run twice.
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

    Specialists become Team members. The triage agent, when one is passed as
    `leader`, configures the Team rather than becoming a member.
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
        leader:            Optional[ResolvedAgent] = None,
        clarify_enabled:   bool = False,
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
            leader=leader,
            clarify_enabled=clarify_enabled,
        )

    def build(
        self,
        active_agents: List[ResolvedAgent],
        org_name:      str                = "Support",
        tools:         Optional[List[Any]] = None,
        memory:        Optional[Any]       = None,
        skills_map:    Optional[dict]      = None,  # {slug: [PromptSkill, ...]}
        db:            Optional[Any]       = None,  # Agno session db (leader/standalone)
        leader:        Optional[ResolvedAgent] = None,  # triage agent, configures the Team
        clarify_enabled: bool              = False,  # Chatbot.clarify_enabled — see AgentFactory._build_tools
    ) -> Optional[Any]:
        """
        Build Team or Agent from active agents.

        `leader` is the triage agent when the space has one. It configures the
        Team (name, description, routing instructions) rather than joining it —
        see _build_team. Without it, Agno's own leader routes on the platform
        prompt. Ignored when there is only one specialist, since there is no
        Team and therefore nothing to route.

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

        # The leader is never a member: in Agno the Team object IS the leader
        # (its own model + instructions), so a triage agent can only configure
        # the Team, not join it. The slug filter is belt-and-braces for callers
        # that still pass triage in the list.
        specialists = [a for a in active_agents if a.slug != "triage"]

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
                clarify_enabled=clarify_enabled,
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
            clarify_enabled=clarify_enabled,
        )
        if not agno_agents:
            return None

        return self._build_team(agno_agents, specialists, leader, org_name, memory, db)

    # ── Private ───────────────────────────────────────────────────────────────

    def _build_team(
        self,
        agno_agents:      List[Any],
        specialists:      List[ResolvedAgent],
        leader:           Optional[ResolvedAgent],
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

            # Routing instructions. A triage agent's system_prompt REPLACES the
            # platform prompt rather than prefixing it: the two are both routing
            # policies, and concatenating them gives the leader contradictory
            # rules with no way to tell which wins.
            if leader and leader.system_prompt:
                triage_instructions = leader.system_prompt.strip()
            else:
                triage_instructions = TRIAGE_COORDINATOR_PROMPT.format(
                    specialist_list=specialist_desc
                )

            team_kwargs: dict = dict(
                name=f"{org_name} Support Team",
                mode=TeamMode(self.cfg.team_mode.lower()),
                model=self.llm_factory.build(),
                # Live-retry chain for the leader's own model — see
                # LLMFactory.build_fallbacks() / AgentFactory.build().
                fallback_models=self.llm_factory.build_fallbacks() or None,
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
                triage_leader=leader.slug if leader else "none",
                session=db is not None,
            )
            return team
        except Exception as e:
            logger.error("team_factory.build_error", error=str(e))
            return None

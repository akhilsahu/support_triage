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

logger = structlog.get_logger()

# System prompt injected into the triage team leader.
# Describes when to route to each specialist — Agno's built-in route mode
# handles the actual delegation mechanism via tool calls; do not instruct
# the leader to output JSON routing commands.
_TRIAGE_COORDINATOR_PROMPT = """\
You are a strict support triage router. Your ONLY job is to delegate every message to the most appropriate specialist. You MUST always delegate — you are NEVER allowed to answer the customer yourself.

Rules:
1. ALWAYS transfer to a specialist. No exceptions.
2. If the message fits multiple specialists, pick the one most relevant to the core ask.
3. If the message is ambiguous or off-topic, still pick the closest specialist.
4. Never respond with your own text. Never explain your routing decision to the customer.

Available specialists:
{specialist_list}
"""


class TeamFactory:
    """
    Builds Agno Team from a list of ResolvedAgents.

    The triage agent (slug="triage"), when present, is used as the Team
    leader with smart routing instructions. Specialists become Team members.
    """

    def __init__(self, cfg: AgnoConfig, space_id: str):
        self.cfg           = cfg
        self.space_id        = space_id
        self.agent_factory = AgentFactory(cfg, space_id)
        self.llm_factory   = LLMFactory(cfg)

    def build(
        self,
        active_agents: List[ResolvedAgent],
        org_name:      str                = "Support",
        tools:         Optional[List[Any]] = None,
        memory:        Optional[Any]       = None,
        skills_map:    Optional[dict]      = None,  # {slug: [PromptSkill, ...]}
    ) -> Optional[Any]:
        """
        Build Team or Agent from active agents.

        Args:
            active_agents: All resolved agents (including triage if enabled)
            org_name:      Display name of the org (for logging/prompts)
            tools:         Shared MCP tools
            memory:        mem0ai memory object, scoped to session
            skills_map:    Pre-resolved skills per agent slug

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

        agno_agents = self.agent_factory.build_all(
            specialists,
            tools=tools,
            memory=memory,
            skills_map=skills_map or {},
        )
        if not agno_agents:
            return None

        # Single specialist — return bare agent, no team overhead
        if len(agno_agents) == 1:
            logger.info("team_factory.single_agent", slug=specialists[0].slug)
            return agno_agents[0]

        return self._build_team(agno_agents, specialists, triage_resolved, org_name, memory)

    # ── Private ───────────────────────────────────────────────────────────────

    def _build_team(
        self,
        agno_agents:      List[Any],
        specialists:      List[ResolvedAgent],
        triage_resolved:  Optional[ResolvedAgent],
        org_name:         str,
        memory:           Optional[Any],
    ) -> Optional[Any]:
        try:
            from agno.team import Team, TeamMode

            # Build the specialist list description for triage instructions
            specialist_desc = "\n".join(
                f"  - {s.slug}: {s.description or s.name}"
                for s in specialists
            )

            # Triage leader instructions — smart route vs coordinate
            triage_instructions = _TRIAGE_COORDINATOR_PROMPT.format(
                specialist_list=specialist_desc
            )
            if triage_resolved and triage_resolved.system_prompt:
                # Allow org-level system_prompt to override the base triage instructions
                triage_instructions = (
                    triage_resolved.system_prompt.strip()
                    + "\n\n"
                    + triage_instructions
                )

            team = Team(
                name=f"{org_name} Support Team",
                mode=TeamMode(self.cfg.team_mode.lower()),
                model=self.llm_factory.build(),
                members=agno_agents,
                instructions=triage_instructions,
                memory_manager=memory,
                show_members_responses=self.cfg.show_members_responses,
                debug_mode=self.cfg.debug,
            )
            logger.info(
                "team_factory.team_built",
                space_id=self.space_id,
                mode=self.cfg.team_mode,
                members=len(agno_agents),
                triage_leader=triage_resolved.slug if triage_resolved else "none",
            )
            return team
        except Exception as e:
            logger.error("team_factory.build_error", error=str(e))
            return None

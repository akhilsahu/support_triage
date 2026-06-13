"""
AgentFactory — builds Agno Agent instances from ResolvedAgent descriptors.

One factory per org session. Shared across all agents in the same org
so LLMFactory and config are constructed once per session.

Skills injection:
    PromptSkill rows are resolved from DB by the orchestrator layer and
    passed in via the `skills` argument to build(). Each skill is injected
    into the system prompt based on its skill_type:
        "instruction" → appended to system prompt as a directive
        "context"     → prepended to user message context
        "format"      → appended as a formatting instruction
        "rag_filter"  → reserved for RAG scope filtering (no prompt change)
"""

from __future__ import annotations
from typing import Any, List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.core.config import AgnoConfig
from app.orchestra.ai.factories.llm import LLMFactory

logger = structlog.get_logger()


class AgentFactory:
    """
    Builds Agno Agent instances from ResolvedAgent config.

    Extend by subclassing:
        class CustomAgentFactory(AgentFactory):
            def _build_system_prompt(self, resolved, skills): ...
    """

    def __init__(self, cfg: AgnoConfig, space_id: str):
        self.cfg         = cfg
        self.space_id      = space_id
        self.llm_factory = LLMFactory(cfg)

    def build(
        self,
        resolved: ResolvedAgent,
        tools:    Optional[List[Any]] = None,
        memory:   Optional[Any]       = None,
        skills:   Optional[List[Any]] = None,   # PromptSkill ORM objects
    ) -> Optional[Any]:
        """
        Build a single Agno Agent from a ResolvedAgent.

        Args:
            resolved: Agent descriptor from DB (builtin or custom)
            tools:    Shared MCP tools for all agents in this session
            memory:   Shared memory object for all agents in this session
            skills:   PromptSkill ORM objects to inject into system prompt
        """
        try:
            from agno.agent import Agent
        except ImportError:
            logger.warning("agno not installed — pip install agno")
            return None

        model = self.llm_factory.build(resolved.temperature, resolved.max_tokens)
        if not model:
            return None

        # RAG is handled at the orchestrator level using the existing VectorStore
        # (same ChromaDB collection + OpenAI embeddings as DynamicAgentExecutor).
        # Agno's built-in Knowledge is intentionally disabled to avoid embedding mismatch.

        try:
            agent = Agent(
                name=resolved.name,
                id=resolved.slug,
                description=resolved.description or resolved.name,
                model=model,
                instructions=self._build_system_prompt(resolved, skills or []),
                tools=tools or [],
                memory_manager=memory,
                search_knowledge=False,
                add_history_to_context=False,
                markdown=self.cfg.markdown,
                debug_mode=self.cfg.debug,
            )
            logger.info(
                "agent_factory.built",
                slug=resolved.slug,
                rag=resolved.rag_enabled,
                tools=len(tools or []),
                memory=memory is not None,
                skills=len(skills or []),
            )
            return agent
        except Exception as e:
            logger.error("agent_factory.build_error", slug=resolved.slug, error=str(e))
            return None

    def build_all(
        self,
        agents: List[ResolvedAgent],
        tools:  Optional[List[Any]] = None,
        memory: Optional[Any]       = None,
        skills_map: Optional[dict]  = None,   # {agent_slug: [PromptSkill, ...]}
    ) -> List[Any]:
        """
        Build all agents, silently skipping failures.

        Args:
            agents:     List of ResolvedAgents to build
            tools:      Shared tools for all agents
            memory:     Shared memory for all agents
            skills_map: Pre-resolved skills per agent slug
        """
        skills_map = skills_map or {}
        return [
            a for a in (
                self.build(r, tools=tools, memory=memory, skills=skills_map.get(r.slug, []))
                for r in agents
            )
            if a is not None
        ]

    # ── Overridable internals ─────────────────────────────────────────────────

    def _build_system_prompt(
        self,
        resolved: ResolvedAgent,
        skills:   List[Any],
    ) -> str:
        """
        Assemble the final system prompt from:
          1. base_prompt   (platform guardrail, hidden from org)
          2. system_prompt (org customisation)
          3. PromptSkill fragments (instruction + format types)

        Context-type skills are injected at the message level (by caller).
        RAG-filter skills are handled by the RAG layer, not here.
        """
        parts = [p.strip() for p in [resolved.base_prompt, resolved.system_prompt] if p and p.strip()]

        if not parts:
            parts = [f"You are a helpful support assistant for {resolved.name}."]

        # Inject instruction and format skills into system prompt
        for skill in skills:
            skill_type = getattr(skill, "skill_type", "instruction")
            if skill_type in ("instruction", "format"):
                skill_text = getattr(skill, "prompt_text", "").strip()
                skill_name = getattr(skill, "name", "Skill")
                if skill_text:
                    parts.append(f"\n[{skill_name.upper()} DIRECTIVE]: {skill_text}")

        return "\n\n".join(parts)

    # RAG is pre-fetched at orchestrator level — no Agno Knowledge needed here.

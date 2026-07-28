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
from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend
from app.orchestra.ai.knowledge.null import NullKnowledgeBackend
from app.orchestra.ai.prompts import (
    DEFAULT_AGENT_PROMPT,
    MULTI_PRODUCT_DIRECTIVES,
    RAG_QUALITY_DIRECTIVES,
)

logger = structlog.get_logger()


def _effective_max_tokens(agent_max_tokens: Optional[int]) -> int:
    """
    Resolve the token cap for an agent.

    - AGENT_MAX_TOKENS_OVERRIDE=True → force AGENT_MAX_TOKENS_LIMIT on every agent.
    - Otherwise use the per-agent value, falling back to AGENT_MAX_TOKENS_LIMIT when
      the agent has none set (None or 0).
    """
    from app.config import settings
    if settings.AGENT_MAX_TOKENS_OVERRIDE:
        return settings.AGENT_MAX_TOKENS_LIMIT
    return agent_max_tokens or settings.AGENT_MAX_TOKENS_LIMIT


class AgentFactory:
    """
    Builds Agno Agent instances from ResolvedAgent config.

    Extend by subclassing:
        class CustomAgentFactory(AgentFactory):
            def _build_system_prompt(self, resolved, skills): ...
    """

    def __init__(
        self,
        cfg:               AgnoConfig,
        space_id:          str,
        knowledge_backend: BaseKnowledgeBackend | None = None,
    ):
        self.cfg               = cfg
        self.space_id          = space_id
        self.llm_factory       = LLMFactory(cfg)
        self.knowledge_backend = knowledge_backend or NullKnowledgeBackend()

    def build(
        self,
        resolved: ResolvedAgent,
        tools:    Optional[List[Any]] = None,
        memory:   Optional[Any]       = None,
        skills:   Optional[List[Any]] = None,   # PromptSkill ORM objects
        db:       Optional[Any]       = None,   # Agno session db (standalone only)
        attach_session: bool          = False,  # True → this agent IS the conversation
    ) -> Optional[Any]:
        """
        Build a single Agno Agent from a ResolvedAgent.

        Args:
            resolved: Agent descriptor from DB (builtin or custom)
            tools:    Shared MCP tools for all agents in this session
            memory:   Agno MemoryManager (only used when attach_session=True)
            skills:   PromptSkill ORM objects to inject into system prompt
            db:       Agno session db (only used when attach_session=True)
            attach_session: when this agent is the standalone conversational
                runner (single-specialist case), attach native history/memory/
                summary knobs. Team members leave this False — the Team leader
                owns the conversation; members only retrieve.
        """
        try:
            from agno.agent import Agent
        except ImportError:
            logger.warning("agno not installed — pip install agno")
            return None

        model = self.llm_factory.build(resolved.temperature,
                                       _effective_max_tokens(resolved.max_tokens))
        if not model:
            return None

        # Build knowledge bundle scoped to this agent's accessible documents.
        # doc_ids come from linked KnowledgeBases; doc_types from builtin agent config.
        # The bundle is opaque — AgentFactory unpacks it; orchestrator never inspects it.
        kb_bundle = self.knowledge_backend.for_agent(
            space_id=self.space_id,
            doc_ids=list(resolved.kb_ids) if not resolved.is_builtin and resolved.kb_ids else None,
            doc_types=list(resolved.rag_doc_types_list) if resolved.rag_enabled else None,
        )

        # CONTEXT: reliable RAG — always inject retrieved references when this
        # agent has knowledge, in addition to the agentic search tool.
        add_knowledge = self.cfg.add_knowledge_to_context and kb_bundle.has_knowledge

        kwargs: dict = dict(
            name=resolved.name,
            id=resolved.slug,
            description=resolved.description or resolved.name,
            model=model,
            instructions=self._build_system_prompt(resolved, skills or []),
            tools=tools or [],
            knowledge=kb_bundle.knowledge,
            knowledge_filters=kb_bundle.filters,
            search_knowledge=kb_bundle.has_knowledge,
            add_knowledge_to_context=add_knowledge,
            markdown=self.cfg.markdown,
            debug_mode=self.cfg.debug,
        )

        # HISTORY / MEMORY / SUMMARY — only when this agent is the conversation.
        if attach_session:
            from app.orchestra.ai.session.store import session_runner_kwargs
            kwargs.update(session_runner_kwargs(self.cfg, db, memory))

        try:
            agent = Agent(**kwargs)
            logger.info(
                "agent_factory.built",
                slug=resolved.slug,
                knowledge_backend=self.knowledge_backend.name(),
                search_knowledge=kb_bundle.has_knowledge,
                add_knowledge_to_context=add_knowledge,
                session=attach_session and db is not None,
                tools=len(tools or []),
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
            parts = [DEFAULT_AGENT_PROMPT.format(name=resolved.name)]

        # Inject instruction and format skills into system prompt
        for skill in skills:
            skill_type = getattr(skill, "skill_type", "instruction")
            if skill_type in ("instruction", "format"):
                skill_text = getattr(skill, "prompt_text", "").strip()
                skill_name = getattr(skill, "name", "Skill")
                if skill_text:
                    parts.append(f"\n[{skill_name.upper()} DIRECTIVE]: {skill_text}")

        # Disambiguation, when this agent's knowledge spans several products.
        # Triage is forbidden from asking the customer anything, so this is the
        # only place a "which product do you mean?" can come from.
        if resolved.product_names:
            parts.append(MULTI_PRODUCT_DIRECTIVES.format(
                products="\n".join(f"  - {p}" for p in resolved.product_names)
            ))

        # Platform answer-quality directives — appended last so they apply on top
        # of any org customisation or skill, for every agent.
        parts.append(RAG_QUALITY_DIRECTIVES)

        return "\n\n".join(parts)

    # RAG is pre-fetched at orchestrator level — no Agno Knowledge needed here.

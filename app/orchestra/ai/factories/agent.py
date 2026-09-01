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
    ASK_USER_INSTRUCTIONS,
    DEFAULT_AGENT_PROMPT,
    MULTI_TOPIC_DIRECTIVES,
    RAG_QUALITY_DIRECTIVES,
    TOPIC_FACTS_DIRECTIVES,
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


def _member_role(resolved: ResolvedAgent) -> Optional[str]:
    """
    What the Team leader matches on when routing.

    Agno lists each member as Role then Description, and its route-mode
    instructions tell the leader to pick "the member whose role and tools are
    the best match" — so role is the field routing actually reads. Naming the
    covered topics is a stronger signal than the owner-written description,
    which is prose aimed at humans.

    None when there are no topics: agno omits the line entirely and routes on
    the description as before, rather than printing it twice. Ignored when the
    agent runs standalone (no leader, nothing to route).
    """
    if resolved.topics:
        return f"Answers questions about: {', '.join(resolved.topic_names)}"
    return None


def _build_tools(resolved: ResolvedAgent, shared_tools: List[Any], clarify_enabled: bool) -> List[Any]:
    """
    Shared MCP tools plus two optional Agno toolkits:

    - UserFeedbackTools (ask_user), only when the OWNER has turned it on
      (Chatbot.clarify_enabled) AND the agent has 2+ topics to disambiguate
      — the owner-facing toggle is the gate; topic count is what makes the
      toggle meaningful for THIS agent. See
      docs/ambiguous-question-clarification-plan.md "Where does the owner
      enable this — chatbot or agent?" for why the toggle lives on the
      chatbot and the per-agent condition is derived, not a second toggle.
    - RenderTools (render_table/render_cards/render_tabs), every agent, gated
      only by RENDER_TOOLS_ENABLED — a layout choice isn't tied to topic
      ambiguity the way asking is; see
      docs/structured-response-rendering-plan.md.
    """
    tools = list(shared_tools)
    if clarify_enabled:
        from agno.tools.user_feedback import UserFeedbackTools
        tools.append(UserFeedbackTools(instructions=ASK_USER_INSTRUCTIONS))


    from app.orchestra.ai.tools.render_tools import RENDER_TOOLS_ENABLED, RenderTools
    if RENDER_TOOLS_ENABLED:
        tools.append(RenderTools())

    return tools


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
        clarify_enabled: bool         = False,  # Chatbot.clarify_enabled — gates ask_user
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
            clarify_enabled: the chatbot owner's toggle for asking the customer
                which topic they mean — see _build_tools.
        """
        try:
            from agno.agent import Agent
        except ImportError:
            logger.warning("agno not installed — pip install agno")
            return None

        model = self.llm_factory.build(
            resolved.temperature,
            _effective_max_tokens(resolved.max_tokens),
            model=resolved.llm_model,
            reasoning_effort=resolved.reasoning_effort,
        )
        if not model:
            return None
        # Live-retry chain (rate limit/timeout/5xx on `model` above) — see
        # LLMFactory.build_fallbacks(). Configured via LLM_PROVIDER_PRIORITY.
        fallback_models = self.llm_factory.build_fallbacks(
            resolved.temperature,
            _effective_max_tokens(resolved.max_tokens),
            reasoning_effort=resolved.reasoning_effort,
        )

        # Build knowledge bundle scoped to this agent's accessible documents.
        # doc_ids come from linked KnowledgeBases; doc_types from builtin agent config.
        # The bundle is opaque — AgentFactory unpacks it; orchestrator never inspects it.
        kb_bundle = self.knowledge_backend.for_agent(
            space_id=self.space_id,
            doc_ids=list(resolved.kb_ids) if not resolved.is_builtin and resolved.kb_ids else None,
            specific_doc_ids=list(resolved.specific_doc_ids) if not resolved.is_builtin and resolved.specific_doc_ids else None,
            kb_assignments=list(resolved.kb_assignments) if not resolved.is_builtin and resolved.kb_assignments else None,
            doc_types=list(resolved.rag_doc_types_list) if resolved.rag_enabled else None,
            topics=list(resolved.topic_scope) or None,
        )


        # CONTEXT: reliable RAG — always inject retrieved references when this
        # agent has knowledge, in addition to the agentic search tool.
        add_knowledge = self.cfg.add_knowledge_to_context and kb_bundle.has_knowledge

        kwargs: dict = dict(
            knowledge_retriever=self._knowledge_retriever(resolved, kb_bundle),
            name=resolved.name,
            id=resolved.slug,
            role=_member_role(resolved),
            description=resolved.description or resolved.name,
            model=model,
            fallback_models=fallback_models or None,
            instructions=self._build_system_prompt(resolved, skills or [], clarify_enabled),

            tools=_build_tools(resolved, tools or [], clarify_enabled),
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
        tools_by_agent: Optional[dict[str, List[Any]]] = None,
        memory: Optional[Any]       = None,
        skills_map: Optional[dict]  = None,   # {agent_slug: [PromptSkill, ...]}
        clarify_enabled: bool       = False,
    ) -> List[Any]:
        """
        Build all agents, silently skipping failures.

        Args:
            agents:     List of ResolvedAgents to build
            tools:      Shared tools for all agents
            memory:     Shared memory for all agents
            skills_map: Pre-resolved skills per agent slug
            clarify_enabled: forwarded to build() — see its docstring
        """
        skills_map = skills_map or {}
        tools_by_agent = tools_by_agent or {}
        return [
            a for a in (
                self.build(r, tools=tools_by_agent.get(r.slug, tools), memory=memory, skills=skills_map.get(r.slug, []),
                          clarify_enabled=clarify_enabled)
                for r in agents
            )
            if a is not None
        ]

    # ── Overridable internals ─────────────────────────────────────────────────

    def _knowledge_retriever(
        self,
        resolved:  ResolvedAgent,
        kb_bundle: Any,
    ) -> Optional[Any]:
        """
        Per-topic retriever for multi-topic agents, else None (agno falls
        back to its own single search over the agent's whole scope).

        Without this, one topic can take the entire top-k and the agent
        silently answers for that topic alone — see per_topic.py.
        """
        if not kb_bundle.has_knowledge or not resolved.topics:
            return None

        from app.config import settings
        from app.orchestra.ai.knowledge.per_topic import build_per_topic_retriever

        return build_per_topic_retriever(
            knowledge=kb_bundle.knowledge,
            base_filters=kb_bundle.filters,
            topics=resolved.topics,
            # What a single search would have returned in total, so splitting it
            # per topic keeps the context size unchanged.
            top_n=settings.RERANK_TOP_N if settings.RERANK_ENABLED else settings.RAG_TOP_K,
            # The backend already resolved the right candidate budget (over-fetch
            # when reranking, plain top-k otherwise).
            fetch_k=getattr(kb_bundle.knowledge, "max_results", None) or settings.RAG_TOP_K,
        )

    def _build_system_prompt(
        self,
        resolved: ResolvedAgent,
        skills:   List[Any],
        clarify_enabled: bool = False,
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

        # Disambiguation, when this agent's knowledge spans several topics.
        # Triage is forbidden from asking the customer anything, so this is the
        # only place a "which topic do you mean?" can come from.
        if resolved.topic_names:
            parts.append(MULTI_TOPIC_DIRECTIVES.format(
                topics="\n".join(f"  - {t}" for t in resolved.topic_names)
            ))

        if clarify_enabled:
            parts.append(
                "[CLARIFICATION DIRECTIVE — USE `ask_user` TOOL]:\n"
                "When a customer asks a general or ambiguous question (e.g., 'What is the annual fee?', 'What are the charges?', 'How to apply?') "
                "that applies to multiple products, cards, or policies in your knowledge base, DO NOT answer for all of them at once or guess. "
                "YOU MUST call the `ask_user` tool immediately to present a choice of available products so the customer can pick which one they hold."
            )


        # Confirmed attributes. Deliberately NOT gated on topic count: the
        # per-topic retriever exists only for a 2-8 topic agent, so hanging
        # facts off it would silently drop them for a one-document agent.
        if resolved.fact_sheet:
            parts.append(TOPIC_FACTS_DIRECTIVES.format(facts=resolved.fact_sheet))

        # Dynamically inject domain-specific package directives (terminology, MCC codes, SOP steps)
        try:
            from app.utils.ai.agent_meta_suggestion import _detect_domain_package
            ctx_text = f"{resolved.description} {' '.join(resolved.topic_names)} {' '.join(resolved.keywords_list)}"
            domain_pkg = _detect_domain_package(
                context_text=ctx_text,
                agent_name=resolved.name,
                doc_types=resolved.rag_doc_types_list,
            )
            if domain_pkg:
                terms_str = "\n".join(f"  • {t}" for t in domain_pkg["terminology"])
                parts.append(f"[DOMAIN DIRECTIVES — {domain_pkg['domain_name']}]:\n{terms_str}")
        except Exception:
            pass

        # Platform answer-quality directives — appended last so they apply on top
        # of any org customisation or skill, for every agent.
        parts.append(RAG_QUALITY_DIRECTIVES)

        return "\n\n".join(parts)

    # RAG is pre-fetched at orchestrator level — no Agno Knowledge needed here.

"""
ResolvedAgent — a unified runtime representation of an agent,
whether it originated from SpaceBuiltinAgentConfig or CustomAgent.

DynamicAgentExecutor works exclusively with ResolvedAgent so it
doesn't need to know which table the agent came from.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple

from sqlalchemy import inspect as sa_inspect

# Above this, a KB is a document library rather than a set of things to answer
# about, and "which of these 20 documents do you mean?" is not a sensible
# question to ask. It also caps the fan-out of per-topic retrieval, which is one
# search per topic per message.
_MAX_TOPICS = 8


@dataclass
class Topic:
    """
    One thing the agent can answer about, and every document describing it.

    A topic is NOT a document. A credit card has a brochure, a T&C PDF and a
    share of a shared fee schedule; before topics existed each of those counted
    separately, so an agent covering two cards across three files announced
    three cards and split its retrieval budget three ways — giving one card two
    slots purely because it had been uploaded twice.

    Deliberately not called a "product": a knowledge base may hold HR policies
    or troubleshooting guides, where that word means nothing.
    """
    key:     str          # topic slug, or the doc_id when the item is untagged
    title:   str
    doc_ids: List[str]


def _topics(agent) -> List[Topic]:
    """
    The candidate topics a question like "what is the annual fee?" could be
    about, grouped by the user-supplied `topic` where one is set.

    Items sharing a topic collapse into one Topic carrying all their doc_ids.
    An item with no topic stays its own single-document Topic, which is exactly
    the old behaviour — so an existing KB keeps working untouched until someone
    fills topics in.

    Items with no doc_id are skipped: an unindexed document can neither be
    cited nor searched on its own, so promising it in the prompt would be a
    topic the agent cannot actually answer for.

    Returns [] unless the kb/items relationships were eager-loaded, since this
    runs under async SQLAlchemy where a lazy load raises. Callers that want
    topics must load them (see db_utils/agent_loader.py).
    """
    def loaded(obj: Any, attr: str) -> bool:
        return obj is not None and attr not in sa_inspect(obj).unloaded

    scope = set(getattr(agent, "topics_list", None) or [])

    found: List[Topic] = []
    by_key: dict = {}
    seen_docs: set = set()
    for link in (agent.knowledge_bases or []):
        if not loaded(link, "kb") or not loaded(link.kb, "items"):
            return []
        for item in link.kb.items:
            title  = (item.title or "").strip()
            doc_id = (item.doc_id or item.indexed_doc_id or "").strip()
            # "url" counts exactly like "doc": a scraped page is indexed the
            # same way and describes its topic just as much. The two differ only
            # in how the dashboard groups them. Excluding "url" here left
            # scraped pages in the KB but outside topic_doc_ids — and since
            # per-topic retrieval searches ONLY those doc_ids, the page was
            # never searched and never cited.
            if item.item_type not in ("doc", "url") or not title or not doc_id:
                continue
            if doc_id in seen_docs:
                continue

            topic = (getattr(item, "topic", None) or "").strip()
            # An agent that declares a scope answers only within it. A shared
            # reference document carries a topic both agents list, so it reaches
            # both without being duplicated.
            if scope and topic and topic not in scope:
                continue

            seen_docs.add(doc_id)
            if topic:
                if topic in by_key:
                    by_key[topic].doc_ids.append(doc_id)
                    continue
                # The topic slug is a filter key, not a label — prefer the item's
                # own title so the customer-facing list stays readable.
                by_key[topic] = Topic(key=topic, title=title, doc_ids=[doc_id])
                found.append(by_key[topic])
            else:
                found.append(Topic(key=doc_id, title=title, doc_ids=[doc_id]))

    # One topic is unambiguous; too many is a library, not a set of subjects.
    return found if 2 <= len(found) <= _MAX_TOPICS else []


# Keeps an 8-topic knowledge base from quietly doubling every message's cost.
_MAX_FACT_LINES = 40
_MAX_FACT_CHARS = 1500


def _fact_sheet(agent) -> str:
    """
    Render this agent's confirmed facts as a prompt block, grouped by subject.

    Only `verified` rows are included — extraction proposes, a human confirms,
    and an unconfirmed row is exactly the case where the wrong fee got attached
    to the wrong card.

    Injected into the system prompt rather than retrieved, for two reasons: it
    is present on every turn regardless of what similarity returned, and the
    per-topic retriever it would otherwise ride on does not exist for an agent
    with fewer than two topics. Provenance is therefore inline (see
    KBFact.render) — a system-prompt block never passes through
    `_citation_from_chunk`.
    """
    def loaded(obj: Any, attr: str) -> bool:
        return obj is not None and attr not in sa_inspect(obj).unloaded

    scope = set(getattr(agent, "topics_list", None) or [])

    by_subject: dict = {}
    for link in (agent.knowledge_bases or []):
        if not loaded(link, "kb") or not loaded(link.kb, "facts"):
            return ""
        for fact in (link.kb.facts or []):
            if not fact.verified:
                continue
            if scope and fact.topic and fact.topic not in scope:
                continue
            by_subject.setdefault(fact.subject, []).append(fact)

    if not by_subject:
        return ""

    lines: List[str] = []
    total = 0
    truncated = False
    for subject in sorted(by_subject):
        block = [subject]
        for fact in by_subject[subject]:
            block.append(f"  {fact.render()}")
        chunk = "\n".join(block)
        if len(lines) + len(block) > _MAX_FACT_LINES or total + len(chunk) > _MAX_FACT_CHARS:
            truncated = True
            break
        lines.extend(block)
        total += len(chunk)

    if truncated:
        import structlog
        structlog.get_logger().info(
            "resolved_agent.fact_sheet.truncated",
            agent=getattr(agent, "slug", "?"), subjects=len(by_subject),
        )
    return "\n".join(lines)


@dataclass
class ResolvedAgent:
    slug:               str
    name:               str
    description:        str
    agent_type:         str
    is_builtin:         bool
    system_prompt:      str
    base_prompt:        str          # empty for custom agents
    temperature:        float
    max_tokens:         int
    rag_enabled:        bool
    rag_doc_types_list: List[str]
    rag_top_k:          int
    keywords_list:      List[str]
    skills_list:        List[str] = field(default_factory=list)   # PromptSkill UUIDs
    kb_ids:             List[str] = field(default_factory=list)   # KnowledgeBase UUIDs
    specific_doc_ids:   List[str] = field(default_factory=list)   # Document UUIDs when selectively assigned
    kb_assignments:     List[dict] = field(default_factory=list)  # [{kb_id: ..., doc_ids: [...]}]
    topic_scope:        List[str] = field(default_factory=list)   # slugs this agent is limited to, [] = all
    # One entry per thing the agent answers about, each owning every document
    # that describes it. Populated only when there are 2+ — titles drive the
    # disambiguation prompt, doc_ids drive per-topic retrieval. Distinct from
    # topic_scope above: that is the filter, this is what the filter resolved to.
    topics:             List[Topic] = field(default_factory=list)
    # Confirmed attributes rendered for the prompt. Independent of the topic
    # count above: a one-document agent has no topics but can still have facts.
    fact_sheet:         str = ""
    # Per-agent LLM override. None = inherit the chatbot-level default, then
    # env config (AgnoConfig.llm_model / reasoning_effort). reasoning_effort:
    # "" = off, low/medium/high = on. Applied in LLMFactory.build.
    llm_model:          Optional[str] = None
    reasoning_effort:   Optional[str] = None
    # Stable persistence identity used for agent-scoped tool authorization.
    # Kept optional so standalone/demo agents that do not originate in the DB
    # remain valid but simply receive no data-source tools.
    source_id:           Optional[str] = None

    @property
    def topic_names(self) -> List[str]:
        return [p.title for p in self.topics]

    @property
    def topic_doc_ids(self) -> List[str]:
        return [d for p in self.topics for d in p.doc_ids]

    # ── Factories ──────────────────────────────────────────────────────────────

    @classmethod
    def from_builtin(cls, config) -> "ResolvedAgent":
        """Build from SpaceBuiltinAgentConfig (catalog must be loaded)."""
        cat = config.catalog
        return cls(
            slug=cat.slug,
            name=cat.name,
            description=cat.description or "",
            agent_type=cat.agent_type,
            is_builtin=True,
            system_prompt=config.system_prompt or "",
            base_prompt=cat.base_prompt or "",
            temperature=config.effective_temperature,
            max_tokens=config.effective_max_tokens,
            rag_enabled=config.effective_rag_enabled,
            rag_doc_types_list=config.effective_rag_doc_types_list,
            rag_top_k=config.effective_rag_top_k,
            keywords_list=config.keywords_list,
            skills_list=config.skills_list,
            kb_ids=[],
            specific_doc_ids=[],
            kb_assignments=[],
            llm_model=config.llm_model,
            reasoning_effort=config.reasoning_effort,
            source_id=str(config.id),
        )

    @classmethod
    def from_custom(cls, agent) -> "ResolvedAgent":
        """Build from CustomAgent (knowledge_bases must be loaded)."""
        s_doc_ids: List[str] = []
        kb_assignments: List[dict] = []
        if agent.knowledge_bases:
            for lnk in agent.knowledge_bases:
                d_ids = [str(d) for d in lnk.doc_ids] if getattr(lnk, "doc_ids", None) else []
                if d_ids:
                    s_doc_ids.extend(d_ids)
                kb_assignments.append({
                    "kb_id": str(lnk.kb_id),
                    "doc_ids": d_ids,
                })
        return cls(
            slug=agent.slug,
            name=agent.name,
            description=agent.description or "",
            agent_type="custom",
            is_builtin=False,
            system_prompt=agent.system_prompt or "",
            base_prompt="",
            temperature=agent.temperature,
            max_tokens=agent.max_tokens,
            rag_enabled=agent.rag_enabled,
            rag_doc_types_list=agent.rag_doc_types_list,
            rag_top_k=agent.rag_top_k,
            keywords_list=agent.keywords_list,
            skills_list=agent.skills_list,
            kb_ids=[str(lnk.kb_id) for lnk in (agent.knowledge_bases or [])],
            specific_doc_ids=s_doc_ids,
            kb_assignments=kb_assignments,
            topic_scope=getattr(agent, "topics_list", None) or [],
            topics=_topics(agent),
            fact_sheet=_fact_sheet(agent),
            llm_model=agent.llm_model,
            reasoning_effort=agent.reasoning_effort,
            source_id=str(agent.id),
        )

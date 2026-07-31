"""
ResolvedAgent — a unified runtime representation of an agent,
whether it originated from SpaceBuiltinAgentConfig or CustomAgent.

DynamicAgentExecutor works exclusively with ResolvedAgent so it
doesn't need to know which table the agent came from.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, List, Tuple

from sqlalchemy import inspect as sa_inspect

# Above this, a KB is a document library rather than a product range, and
# "which of these 20 documents do you mean?" is not a sensible question to ask.
# It also caps the fan-out of per-product retrieval, which is one search per
# product per message.
_MAX_PRODUCTS = 8


def _products(agent) -> List[Tuple[str, str]]:
    """
    Distinct (doc_id, title) pairs across the agent's KBs — the candidate
    products a question like "what is the annual fee?" could be about.

    Items with no doc_id are skipped: an unindexed document can neither be
    cited nor searched on its own, so promising it in the prompt would be a
    product the agent cannot actually answer for.

    Returns [] unless the kb/items relationships were eager-loaded, since this
    runs under async SQLAlchemy where a lazy load raises. Callers that want
    products must load them (see db_utils/agent_loader.py).
    """
    def loaded(obj: Any, attr: str) -> bool:
        return obj is not None and attr not in sa_inspect(obj).unloaded

    found: List[Tuple[str, str]] = []
    seen: set = set()
    for link in (agent.knowledge_bases or []):
        if not loaded(link, "kb") or not loaded(link.kb, "items"):
            return []
        for item in link.kb.items:
            title  = (item.title or "").strip()
            doc_id = (item.doc_id or item.indexed_doc_id or "").strip()
            if item.item_type == "doc" and title and doc_id and doc_id not in seen:
                seen.add(doc_id)
                found.append((doc_id, title))

    # One document is unambiguous; too many is a library, not a product range.
    return found if 2 <= len(found) <= _MAX_PRODUCTS else []


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
    # (doc_id, title) per indexed document, populated only when there are 2+ —
    # titles drive the disambiguation prompt, doc_ids drive per-product retrieval.
    products:           List[Tuple[str, str]] = field(default_factory=list)

    @property
    def product_names(self) -> List[str]:
        return [title for _, title in self.products]

    @property
    def product_doc_ids(self) -> List[str]:
        return [doc_id for doc_id, _ in self.products]

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
        )

    @classmethod
    def from_custom(cls, agent) -> "ResolvedAgent":
        """Build from CustomAgent (knowledge_bases must be loaded)."""
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
            products=_products(agent),
        )

"""
AI-generated key-benefit bullets for the homepage 'key_benefits' section.

Separate concern from the section *list* decision in homepage_sections.py --
that picks structure (which sections, what order); this generates the actual
copy for one specific section, only called when "key_benefits" is in the
selected list. Own cache entry, own LLM call, own failure isolation -- a
problem here should never take down the (already-decided) section list.
Mirrors app/utils/ai/chat_suggestions.py.

Grounded in this chatbot's own KB content (same app/renderengine/base.py
sample_rag_content used by faq.py) -- generating from agent
name/description alone previously let the LLM invent specific self-service
actions ("check your premium status", "renew online") that weren't actually
offered. No KB content available -> FALLBACK_BENEFITS, never a guess.
"""
from __future__ import annotations

import json
from uuid import UUID

import structlog

from app.renderengine.base import cached_or_compute, chatbot_doc_types, sample_rag_content, sibling_note

logger = structlog.get_logger()

_CACHE_TTL_SECONDS = 60 * 60 * 4
_CACHE_KEY = "renderengine:key_benefits:{chatbot_id}:{siblings}"
_MAX_BENEFITS = 4
# Wider than base.py's 2.5s default -- a real LLM completion (RAG sample +
# generation), same reasoning as data_block.py's widened budget. Measured
# 2.7-3.5s standalone; runs concurrently with faq/data_block via
# asyncio.gather (see app/api/space.py), and that contention was observed
# pushing it past a tighter 4.0s budget -- better to wait a bit longer for
# real grounded content than fall back to generic filler under normal load.
_COMPUTE_TIMEOUT_SECONDS = 6.0

# Used whenever the engine can't produce a validated recommendation --
# generic but not empty, so the section never renders as a blank gap.
FALLBACK_BENEFITS = [
    "Get answers to your questions instantly",
    "Available 24/7",
]


def _validate(raw: str) -> list[str] | None:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return None
        benefits = [b.strip() for b in parsed if isinstance(b, str) and b.strip()]
        benefits = benefits[:_MAX_BENEFITS]
        return benefits or None
    except Exception:
        return None


async def get_key_benefits(
    *,
    chatbot_id: UUID,
    space_id: UUID,
    space_name: str,
    description: str,
    active_agents: list,
    other_sections: list[str] | None = None,
) -> list[str]:
    """Return 3-4 short benefit bullet strings grounded in this chatbot's own
    KB content. Always returns something -- FALLBACK_BENEFITS (generic,
    always-true claims) when there's no KB content to ground specifics in.

    other_sections: ids of the other sections also selected for this page
    (e.g. ["faq", "data_block"]) -- included in the cache key so a different
    page composition doesn't reuse content nudged for a different sibling set."""
    siblings = ",".join(sorted(other_sections)) if other_sections else "none"
    cache_key = _CACHE_KEY.format(chatbot_id=chatbot_id, siblings=siblings)
    doc_types = chatbot_doc_types(active_agents)

    async def _compute() -> str:
        return await _generate(space_id, space_name, description, active_agents, doc_types, other_sections)

    result = await cached_or_compute(
        cache_key, _CACHE_TTL_SECONDS, _compute,
        timeout_seconds=_COMPUTE_TIMEOUT_SECONDS,
        validate=_validate,
    )
    return result or FALLBACK_BENEFITS


async def _generate(
    space_id: UUID, space_name: str, description: str, active_agents: list,
    doc_types: list[str], other_sections: list[str] | None = None,
) -> str:
    from app.services.llm_service import llm_service

    rag_context = await sample_rag_content(space_id, doc_types, query_text="key features and benefits")
    if not rag_context:
        # No KB content to ground specific claims in -- don't let the LLM
        # invent self-service actions this bot doesn't actually offer.
        # cached_or_compute treats this as a miss -> caller falls back to
        # the generic, always-true FALLBACK_BENEFITS.
        raise ValueError("no KB content available for key benefits generation")

    specialists = [a for a in active_agents if getattr(a, "slug", "") != "triage"]
    agent_lines = "\n".join(
        f"- {a.name}: {a.description or a.agent_type}" for a in specialists
    ) or "- General support agent"

    system = (
        "You write short, concrete benefit bullets for a customer support chat widget's "
        "welcome screen, based strictly on the knowledge base content provided.\n"
        "Rules:\n"
        "- Return ONLY a valid JSON array of 3-4 short strings, each under 50 characters.\n"
        "- Each bullet must describe a concrete capability that is actually evidenced by the "
        "knowledge base content below -- never invent a feature, self-service action, or "
        "process that isn't stated in it. When in doubt, describe a topic the content covers "
        '(e.g. "Learn about claim eligibility") rather than an action you\'re not sure is offered.\n'
        "- Start each bullet with an active verb where the content supports one; otherwise "
        "state the topic plainly. Specificity grounded in real content is what makes a visitor "
        "click -- a plausible-sounding invented feature is worse than a plain, accurate one.\n"
        "- These are positive HIGHLIGHTS shown to welcome a prospective customer. Lead with "
        "benefits, features, and helpful topics. Do NOT surface exclusions, penalties, suicide "
        "clauses, lapses, or other negative/grim clauses as a highlight, even if they appear in "
        "the content -- those belong in detailed answers, not the welcome highlights.\n"
        "- The support agents/description below are context for tone and scope only, not a "
        "license to state capabilities beyond what the knowledge base content shows.\n"
        f"{sibling_note(other_sections)}"
        'Output format: ["benefit 1", "benefit 2", "benefit 3"]'
    )
    user = (
        f"Company: {space_name}\n"
        f"Description: {description or '(none provided)'}\n"
        f"Support agents:\n{agent_lines}\n"
        f"Knowledge base content sample:\n{rag_context}\n"
        "\nWrite the benefit bullets."
    )
    result = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
        temperature=0.4,
        max_tokens=150,
    )
    content = (result or {}).get("content", "").strip()
    if not content:
        raise ValueError("empty LLM response")
    return content

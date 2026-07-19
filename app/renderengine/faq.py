"""
AI-generated FAQ list for the homepage 'faq' section.

Separate concern from the section *list* decision in homepage_sections.py --
only called when "faq" is in the selected list. Own cache entry, own LLM
call, own failure isolation. Samples real KB content the same way
app/utils/ai/chat_suggestions.py does for suggestion chips, so the questions
are grounded in what this bot's knowledge base actually contains rather than
invented.
"""
from __future__ import annotations

import json
from uuid import UUID

import structlog

from app.renderengine.base import cached_or_compute, chatbot_doc_types, sample_rag_content, sibling_note

logger = structlog.get_logger()

_CACHE_TTL_SECONDS = 60 * 60 * 4
_CACHE_KEY = "renderengine:faq:{chatbot_id}:{siblings}"
_MAX_FAQS = 5
_MAX_ANSWER_CHARS = 320
# Wider than base.py's 2.5s default -- a real LLM completion (RAG sample +
# generation), same reasoning as data_block.py's widened budget. Runs
# concurrently with key_benefits/data_block via asyncio.gather (see
# app/api/space.py); see key_benefits.py's note on why this needed headroom
# beyond a single standalone call's measured latency.
_COMPUTE_TIMEOUT_SECONDS = 6.0

# Empty, not a fabricated placeholder -- FaqSection.tsx already renders
# nothing when this is empty, same safe-no-op behavior as before this was wired up.
FALLBACK_FAQS: list[dict] = []


def _validate(raw: str) -> list[dict] | None:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return None

        faqs: list[dict] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            q = item.get("question")
            a = item.get("answer")
            if isinstance(q, str) and isinstance(a, str) and q.strip() and a.strip():
                faqs.append({"question": q.strip(), "answer": a.strip()[:_MAX_ANSWER_CHARS]})
        faqs = faqs[:_MAX_FAQS]
        return faqs or None
    except Exception:
        return None


async def get_faq(
    *,
    chatbot_id: UUID,
    space_id: UUID,
    space_name: str,
    active_agents: list,
    other_sections: list[str] | None = None,
) -> list[dict]:
    """Return up to 3 {question, answer} pairs grounded in this specific
    chatbot's own KB (via its active agents' rag_doc_types_list) -- not the
    whole space's documents. Returns an empty list (not an error) when
    there's no usable KB content -- FaqSection.tsx renders nothing for an
    empty list, same as before this was wired up.

    other_sections: ids of the other sections also selected for this page --
    included in the cache key so a different page composition doesn't reuse
    content nudged for a different sibling set."""
    siblings = ",".join(sorted(other_sections)) if other_sections else "none"
    cache_key = _CACHE_KEY.format(chatbot_id=chatbot_id, siblings=siblings)
    doc_types = chatbot_doc_types(active_agents)

    async def _compute() -> str:
        return await _generate(space_id, space_name, doc_types, other_sections)

    result = await cached_or_compute(
        cache_key, _CACHE_TTL_SECONDS, _compute,
        timeout_seconds=_COMPUTE_TIMEOUT_SECONDS,
        validate=_validate,
    )
    return result if result is not None else FALLBACK_FAQS


async def _generate(
    space_id: UUID, space_name: str, doc_types: list[str], other_sections: list[str] | None = None,
) -> str:
    from app.services.llm_service import llm_service

    rag_context = await sample_rag_content(space_id, doc_types, query_text="frequently asked questions")
    if not rag_context:
        # No KB content to ground questions in -- don't let the LLM invent
        # generic FAQs unrelated to this bot's actual knowledge base.
        raise ValueError("no KB content available for FAQ generation")

    system = (
        "You write a short FAQ list for a customer support chat widget's welcome screen, "
        "based strictly on the knowledge base content provided.\n"
        "Rules:\n"
        '- Return ONLY a valid JSON array of 4-5 objects: {"question": "...", "answer": "..."}.\n'
        "- Questions must be natural, customer-phrased, under 70 characters -- write the "
        "question a real visitor would actually type, not a formal restatement of a doc heading.\n"
        "- Answers must be a complete, helpful 1-2 sentences (roughly 150-300 characters), based "
        "only on the provided content, and lead with the concrete answer first (not \"According to "
        "our policy...\"). Include the specific figure, timeframe, or condition when the content "
        "gives one -- never invent information not present in it.\n"
        "- Prefer the 4-5 most distinct, high-value questions over near-duplicates.\n"
        "- If the content doesn't support at least one clear Q&A pair, return an empty array [].\n"
        f"{sibling_note(other_sections)}"
        'Output format: [{"question": "...", "answer": "..."}]'
    )
    user = (
        f"Company: {space_name}\n"
        f"Knowledge base content sample:\n{rag_context}\n"
        "\nWrite the FAQ list."
    )
    result = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
        temperature=0.3,
        max_tokens=400,
    )
    content = (result or {}).get("content", "").strip()
    if not content:
        raise ValueError("empty LLM response")
    return content

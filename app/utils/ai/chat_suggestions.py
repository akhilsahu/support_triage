"""
Generate contextual chat suggestion chips for the customer chat page.

If any active agent has RAG enabled, we sample chunks from ChromaDB and
ask the LLM to generate questions a customer would naturally ask about that content.

Everything here is scoped to ONE CHATBOT, not to the space. A space can host
several brands (e.g. an insurance chatbot and a credit-card chatbot side by
side), and chips generated from the space's whole document set advertise the
wrong brand — a credit-card widget offering "Can I return my policy within 15
days?". So both the sample and the cache key carry the chatbot id.

Results cached in Redis indefinitely (no expiry), per chatbot — this is only a
fallback for a chatbot with no homepage draft/snapshot yet (see
app/api/customer.py's get_chat_suggestions, which checks the durable
draft/published snapshot first). Once generated here it stays until the owner
explicitly regenerates their homepage — see get_suggestions()'s docstring.
"""
from __future__ import annotations

import json
import logging
from uuid import UUID

logger = logging.getLogger(__name__)

_FALLBACKS = [
    "How can I track my order?",
    "What is your return policy?",
    "I need help with my account",
    "How do I contact support?",
]

# Keyed by chatbot, not space. A space-only key was shared by every chatbot in
# the space, so whichever one was asked first won the key and served its chips
# to all the others.
_CACHE_KEY  = "chat:suggestions:{space_id}:{chatbot_id}"


async def get_suggestions(
    space_id: UUID,
    chatbot_id: UUID,
    org_name: str,
    active_agents: list,
    doc_types: list[str],
) -> list[str]:
    """
    Return 4 suggestion strings for one chatbot — always returns something.

    active_agents must be that chatbot's agents; their linked KnowledgeBases are
    what the content sample is restricted to.

    No TTL: once generated, this cache entry is the answer until something
    explicitly overwrites it. Previously expired after 1 hour, so wording
    silently changed on whoever happened to open the chat after the cache
    lapsed — not a refresh, a fresh roll of a non-deterministic LLM call each
    time. The owner's actual "regenerate" action is the homepage-ui/generate
    endpoint, which writes into ChatbotHomepageSnapshot.draft_payload — a
    durable Postgres row that get_chat_suggestions checks BEFORE ever reaching
    this function, so once a draft exists this Redis path is never consulted
    again for that chatbot.
    """
    cache_key = _CACHE_KEY.format(space_id=str(space_id), chatbot_id=str(chatbot_id))

    # Redis cache
    try:
        from app.core.redis import redis_client
        cached = await redis_client.get(cache_key)
        if cached and isinstance(cached, list) and len(cached) >= 2:
            return cached[:4]
    except Exception:
        pass

    suggestions = await _generate(space_id, org_name, active_agents, doc_types)

    try:
        from app.core.redis import redis_client
        await redis_client.set(cache_key, suggestions)   # no expire= -> persists until overwritten
    except Exception:
        pass

    return suggestions


async def _sample_rag_content(space_id: UUID, kb_ids: list[str], doc_types: list[str]) -> str:
    """
    Sample a handful of ChromaDB chunks to give the LLM real context.

    kb_ids are the KnowledgeBases this chatbot's agents are linked to. When they
    exist that is the only scope used — doc_types come from the whole space and
    would pull in a sibling chatbot's documents. doc_types remain the fallback
    for builtin agents, which have no linked KBs and select content by category.
    """
    try:
        from app.rag.vector_store import get_vector_store, COLLECTION_CLIENT

        store = get_vector_store()
        client_id = str(space_id)
        sample_texts: list[str] = []

        if kb_ids:
            from app.rag.vector_store import client_where
            wheres = [client_where(client_id, kb_ids=kb_ids)]
        else:
            from app.rag.vector_store import client_doc_type_where
            types_to_sample = doc_types[:3] if doc_types else ["general"]
            wheres = [client_doc_type_where(client_id, dt) for dt in types_to_sample]

        for where in wheres:
            hits = store.query(
                collection=COLLECTION_CLIENT,
                query_text="what can customers ask about",
                # One combined query when scoping by KB, so ask it for the whole
                # budget instead of the 3-per-doc_type the loop used.
                top_k=6 if kb_ids else 3,
                where=where,
            )
            for h in hits:
                text = h.get("document", "")
                if text:
                    sample_texts.append(text[:300])
            if len(sample_texts) >= 6:
                break

        if sample_texts:
            return "\n---\n".join(sample_texts[:6])
    except Exception as e:
        logger.warning("chat_suggestions.rag_sample_failed", error=str(e))

    return ""


async def _generate(
    space_id: UUID,
    org_name: str,
    active_agents: list,
    doc_types: list[str],
) -> list[str]:
    """Generate 4 suggestions via LLM, using RAG content when available."""
    try:
        from app.services.llm_service import llm_service

        # Agents excluding triage
        specialists = [a for a in active_agents if getattr(a, "slug", "") != "triage"]
        rag_agents  = [a for a in specialists if getattr(a, "rag_enabled", False)]

        agent_lines = "\n".join(
            f"- {a.name}: {a.description or a.agent_type}"
            for a in specialists
        ) or "- General support agent"

        # The KnowledgeBases this chatbot's agents can actually read.
        kb_ids = [kb for a in rag_agents for kb in (getattr(a, "kb_ids", None) or [])]

        # doc_types is a space-wide list. Once we can scope by KB it is a source
        # of another brand's topics, so it only survives as the builtin fallback.
        doc_line = "" if kb_ids else (", ".join(doc_types) if doc_types else "")

        # Sample real KB content if RAG agents exist
        rag_context = ""
        if rag_agents:
            rag_context = await _sample_rag_content(space_id, kb_ids, doc_types)

        system = (
            "You generate short suggested questions for a customer support chat widget.\n"
            "Rules:\n"
            "- Return ONLY a valid JSON array of exactly 4 strings.\n"
            "- Each must be a natural customer question, under 60 characters.\n"
            "- If knowledge base content is provided, make questions specific to that content.\n"
            "- Do NOT include agent names, technical jargon, or company names in the questions.\n"
            "- Vary the questions — cover different topics.\n"
            'Output format: ["question 1", "question 2", "question 3", "question 4"]'
        )

        context_block = ""
        if rag_context:
            context_block = f"\nKnowledge base content sample:\n{rag_context}\n"

        user = (
            f"Company: {org_name}\n"
            f"Support agents:\n{agent_lines}\n"
            + (f"Knowledge base topics: {doc_line}\n" if doc_line else "")
            + context_block
            + "\nGenerate 4 suggested customer questions."
        )

        result = await llm_service.generate_with_fallback(
            messages=[{"role": "user", "content": user}],
            system_prompt=system,
            temperature=0.7,
            max_tokens=150,
        )

        raw = (result or {}).get("content", "").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()

        parsed = json.loads(raw)
        if isinstance(parsed, list) and all(isinstance(s, str) for s in parsed):
            return [s.strip() for s in parsed[:4] if s.strip()]

    except Exception as e:
        logger.warning("chat_suggestions.llm_failed", error=str(e))

    # Always return fallbacks — never empty
    return _FALLBACKS

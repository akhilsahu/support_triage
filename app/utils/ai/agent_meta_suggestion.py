"""
app/utils/ai/agent_meta_suggestion.py

Generates placeholder agent metadata (name, description, system_prompt) using
the LLM + the org's existing ChromaDB knowledge base documents as context.

Cache strategy
──────────────
Results are stored in `agent_meta_suggestions` (org_id + doc_type_key unique).
If the same org requests a suggestion for the same doc_type combination again
(e.g. the user cancelled and re-opened the modal) the cached row is returned
immediately — no LLM call.

When the user finally creates the agent the caller should update the row's
`agent_id` to link the suggestion to the resulting AgentDefinition.

Public API
──────────
    result = await get_or_generate(db, org_id, org_name, doc_types)
    # result → {name, description, system_prompt, from_cache: bool, suggestion_id}

    await link_agent(db, suggestion_id, agent_id)
    # Call this after agent_definitions row is created.
"""

from __future__ import annotations

import json
import re
from typing import Optional
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


# ── Public helpers ────────────────────────────────────────────────────────────

def build_doc_type_key(doc_types: list[str]) -> str:
    """Stable, sorted cache key from a list of doc_types."""
    return ",".join(sorted(set(doc_types))) if doc_types else "general"


# Keep for backward compat
def build_cache_key(doc_types: list[str]) -> str:
    return build_doc_type_key(doc_types)


async def get_or_generate(
    db: AsyncSession,
    org_id: UUID,
    org_name: str,
    doc_types: list[str],
    doc_id: str | None = None,
    force: bool = False,
) -> dict:
    """
    Return a cached AgentMetaSuggestion or generate a new one via LLM.

    Returns
    -------
    {
        "suggestion_id": str,
        "name":          str,
        "description":   str,
        "system_prompt": str,
        "from_cache":    bool,
    }
    """
    from app.models.org import AgentMetaSuggestion

    _doc_id  = doc_id or ""
    type_key = build_doc_type_key(doc_types)

    # ── Check cache ──────────────────────────────────────────────────────────
    result = await db.execute(
        select(AgentMetaSuggestion).where(
            AgentMetaSuggestion.org_id == org_id,
            AgentMetaSuggestion.doc_id == _doc_id,
            AgentMetaSuggestion.doc_type_key == type_key,
        )
    )
    cached = result.scalar_one_or_none()
    if cached:
        if force:
            logger.info("agent_meta_suggestion.cache_bust", org_id=str(org_id),
                        doc_id=_doc_id, type_key=type_key)
            await db.delete(cached)
            await db.commit()
            cached = None
        else:
            logger.info("agent_meta_suggestion.cache_hit", org_id=str(org_id),
                        doc_id=_doc_id, type_key=type_key)
            return {
                "suggestion_id": str(cached.id),
                "name":          cached.name,
                "description":   cached.description,
                "system_prompt": cached.system_prompt,
                "from_cache":    True,
            }

    # ── Generate via LLM ─────────────────────────────────────────────────────
    generated = await _generate(org_id=str(org_id), org_name=org_name,
                                doc_types=doc_types, doc_id=_doc_id)

    # ── Persist to cache ─────────────────────────────────────────────────────
    suggestion = AgentMetaSuggestion(
        org_id=org_id,
        doc_id=_doc_id,
        doc_type_key=type_key,
        name=generated["name"],
        description=generated["description"],
        system_prompt=generated["system_prompt"],
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)

    logger.info("agent_meta_suggestion.generated",
                org_id=str(org_id), doc_id=_doc_id, type_key=type_key,
                suggestion_id=str(suggestion.id))

    return {
        "suggestion_id": str(suggestion.id),
        "name":          suggestion.name,
        "description":   suggestion.description,
        "system_prompt": suggestion.system_prompt,
        "from_cache":    False,
    }


async def link_agent(db: AsyncSession, suggestion_id: str, agent_id: UUID) -> None:
    """
    After the user creates an agent from a suggestion, link the two rows.
    Safe to call even if suggestion_id is stale or missing.
    """
    from app.models.org import AgentMetaSuggestion
    try:
        result = await db.execute(
            select(AgentMetaSuggestion).where(
                AgentMetaSuggestion.id == suggestion_id
            )
        )
        row = result.scalar_one_or_none()
        if row and not row.agent_id:
            row.agent_id = agent_id
            await db.commit()
    except Exception as e:
        logger.warning("agent_meta_suggestion.link_failed", error=str(e))


# ── LLM generation ────────────────────────────────────────────────────────────

async def _generate(org_id: str, org_name: str, doc_types: list[str],
                    doc_id: str = "") -> dict:
    """
    Build context from ChromaDB + call LLM to produce name/description/system_prompt.
    Falls back to deterministic defaults if LLM fails.
    """
    import asyncio
    from app.services.llm_service import llm_service

    # Fetch doc metadata from ChromaDB in a thread (ChromaDB is sync)
    loop = asyncio.get_event_loop()
    doc_context = await loop.run_in_executor(
        None, lambda: _fetch_doc_context(org_id, doc_types, doc_id)
    )

    prompt = _build_prompt(org_name=org_name, doc_types=doc_types, doc_context=doc_context)

    try:
        result = await llm_service.generate_with_fallback(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=(
                "You are an AI assistant that helps configure customer support agents. "
                "Respond ONLY with valid JSON — no markdown, no extra text."
            ),
            temperature=0.4,
            max_tokens=400,
        )

        raw = (result.get("content") or "").strip()

        # Strip markdown code fences if the model wrapped JSON in them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            raw = re.sub(r"^json\s*", "", raw).strip()
            if "```" in raw:
                raw = raw[: raw.index("```")]

        data = json.loads(raw)

        return {
            "name":          _clean(data.get("name"), 200) or _default_name(doc_types),
            "description":   _clean(data.get("description"), 500) or "",
            "system_prompt": _clean(data.get("system_prompt"), 2000) or "",
        }

    except Exception as e:
        logger.warning("agent_meta_suggestion.llm_failed", error=str(e))
        return _fallback(org_name, doc_types)


# ── ChromaDB context builder ──────────────────────────────────────────────────

def _fetch_doc_context(org_id: str, doc_types: list[str], doc_id: str = "") -> str:
    """
    Collect distinct document metadata (filename, kb_name, description) for the
    given doc_types (and optionally a specific doc_id) from the org's ChromaDB partition.
    Returns a bullet list string for inclusion in the LLM prompt.
    """
    try:
        from app.rag.vector_store import get_vector_store, COLLECTION_CLIENT

        col = get_vector_store()._collection(COLLECTION_CLIENT)
        lines: list[str] = []

        for doc_type in doc_types:
            try:
                where_filter: dict
                if doc_id:
                    where_filter = {"$and": [
                        {"client_id": {"$eq": org_id}},
                        {"doc_type":  {"$eq": doc_type}},
                        {"doc_id":    {"$eq": doc_id}},
                    ]}
                else:
                    where_filter = {"$and": [
                        {"client_id": {"$eq": org_id}},
                        {"doc_type":  {"$eq": doc_type}},
                    ]}

                results = col.get(
                    where=where_filter,
                    include=["metadatas"],
                    limit=5,
                )
                seen: set[str] = set()
                for meta in results.get("metadatas") or []:
                    doc_id = meta.get("doc_id", "")
                    if doc_id in seen:
                        continue
                    seen.add(doc_id)
                    parts = [f"type={doc_type}"]
                    if meta.get("filename"):
                        parts.append(f"file={meta['filename']}")
                    if meta.get("kb_name"):
                        parts.append(f"kb={meta['kb_name']}")
                    if meta.get("description"):
                        parts.append(f"desc={meta['description'][:120]}")
                    lines.append("• " + " | ".join(parts))
            except Exception:
                lines.append(f"• type={doc_type}")

        return "\n".join(lines) if lines else "\n".join(f"• type={dt}" for dt in doc_types)

    except Exception as e:
        logger.warning("agent_meta_suggestion.chroma_context_failed", error=str(e))
        return "\n".join(f"• type={dt}" for dt in doc_types)


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(org_name: str, doc_types: list[str], doc_context: str) -> str:
    types_str = ", ".join(doc_types)
    return (
        f'You are configuring a customer support agent for "{org_name}".\n\n'
        f"The agent will answer questions using these specific knowledge base documents:\n"
        f"{doc_context}\n\n"
        f"Document types covered: {types_str}\n\n"
        "Your job is to name this agent after the product or topic in the documents above — "
        "specific enough to be recognisable, but not tied to a version number or doc type.\n"
        "For example:\n"
        "• A doc about PS5 → 'PS5 Support'\n"
        "• A doc about iPhone warranty → 'iPhone Warranty Support'\n"
        "• A doc about company travel policy → 'Travel Policy'\n"
        "and NOT generic like 'Tech Support Agent'.\n\n"
        "Return a JSON object with exactly these three fields:\n"
        "{\n"
        '  "name": "<2–5 words — named after the specific product/topic in the docs above>",\n'
        '  "description": "<1–2 sentences — what specific product or topic this agent covers; '
        'used by the triage system to route customers to the right agent>",\n'
        '  "system_prompt": "<3–5 sentences — introduce the agent by its specific product/topic, '
        'state what it can help with, instruct it to be accurate and concise, '
        'and tell it to escalate to human support if it cannot answer>"\n'
        "}\n\n"
        "Rules:\n"
        "• name — must reflect the actual product/topic, not the doc_type\n"
        "• description — triage uses this to decide which agent to route to; be specific\n"
        "• system_prompt — reference the actual product/topic by name"
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(value: object, max_len: int) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


def _default_name(doc_types: list[str]) -> str:
    primary = doc_types[0].replace("_", " ").title() if doc_types else "Support"
    return f"{primary} Agent"


def _fallback(org_name: str, doc_types: list[str]) -> dict:
    """Deterministic fallback when the LLM is unavailable."""
    primary = doc_types[0].replace("_", " ").title() if doc_types else "Support"
    types_str = ", ".join(doc_types)
    return {
        "name": f"{primary} Agent",
        "description": (
            f"Handles customer questions related to {types_str}."
        ),
        "system_prompt": (
            f"You are a {primary} specialist for {org_name}. "
            f"Help customers with questions about {types_str} "
            "using the knowledge base provided. "
            "Be accurate, professional, and concise. "
            "If the answer is not in the knowledge base, "
            "apologise and direct the customer to human support."
        ),
    }

"""
Shared scaffolding for renderengine modules.

Every concrete engine (homepage_sections.py, and later response_components.py)
needs the same flow: check Redis cache → run a timeout-guarded async compute
→ validate the result against its own allowed pool → cache on success. This
factors that flow out once so engines don't duplicate the try/except/timeout
plumbing already proven in app/utils/ai/chat_suggestions.py.

Never raises. Any failure (cache error, timeout, LLM error, invalid output)
resolves to None — the caller is always responsible for its own default.
"""
from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, Optional
from uuid import UUID

import structlog

logger = structlog.get_logger()

DEFAULT_TIMEOUT_SECONDS = 2.5


def chatbot_doc_types(active_agents: list) -> list[str]:
    """
    Doc types scoped to THIS chatbot's own RAG-enabled agents -- not the
    space-wide document set. A space can have multiple chatbots with
    different knowledge bases; each agent's rag_doc_types_list already
    reflects what that specific chatbot (via _get_active_agents_cached,
    itself chatbot_id-scoped) actually has RAG-enabled for. Deliberately
    does NOT fall back to "all doc types in the space" -- no declared doc
    types means no grounded content, not "show everything."

    Shared by any generator that needs to ground its output in this bot's
    real knowledge base rather than inventing content (faq.py, key_benefits.py).
    """
    seen: list[str] = []
    for agent in active_agents:
        if not getattr(agent, "rag_enabled", False):
            continue
        for dt in getattr(agent, "rag_doc_types_list", None) or []:
            if dt not in seen:
                seen.append(dt)
    return seen


async def sample_rag_content(
    space_id: UUID,
    doc_types: list[str],
    query_text: str,
    *,
    max_doc_types: int = 3,
    max_samples: int = 6,
    sample_chars: int = 400,
) -> str:
    """
    Sample a handful of ChromaDB chunks from this chatbot's own RAG-scoped
    doc types (see chatbot_doc_types), so a content generator can ground its
    output in what the bot's knowledge base actually says instead of
    inventing plausible-sounding specifics. Empty string when there's
    nothing to sample -- the caller decides how to handle "no grounding
    available" (typically: don't generate specific claims at all).
    """
    if not doc_types:
        return ""

    try:
        from app.rag.vector_store import get_vector_store, COLLECTION_CLIENT, client_doc_type_where

        store = get_vector_store()
        client_id = str(space_id)
        sample_texts: list[str] = []

        for dt in doc_types[:max_doc_types]:
            where = client_doc_type_where(client_id, dt)
            # store.query is synchronous (ChromaDB client) -- offload to a
            # thread so it doesn't block the event loop. Generators run
            # concurrently via asyncio.gather (see app/api/space.py), so a
            # blocking call here would stall sibling in-flight LLM calls too.
            hits = await asyncio.to_thread(
                store.query,
                collection=COLLECTION_CLIENT,
                query_text=query_text,
                top_k=3,
                where=where,
            )
            for h in hits:
                text = h.get("document", "")
                if text:
                    sample_texts.append(text[:sample_chars])
            if len(sample_texts) >= max_samples:
                break

        return "\n---\n".join(sample_texts[:max_samples]) if sample_texts else ""
    except Exception as e:
        logger.warning("renderengine.rag_sample_failed", error=str(e))
        return ""


def sibling_note(other_sections: list[str] | None) -> str:
    """
    One prompt line telling a content generator which other sections are also
    selected for this page, so it can avoid restating what a sibling section
    already covers (e.g. key_benefits repeating the same figure data_block
    leads with). Sibling AWARENESS only -- generators never see each other's
    actual generated content, just the section id list already decided by
    homepage_sections.py, so calls can stay independent/parallel. Empty
    string when there's nothing to mention.
    """
    if not other_sections:
        return ""
    return (
        f"- This page also shows these other sections: {', '.join(other_sections)}. "
        "Don't repeat generic points those already cover -- keep this section's content distinct.\n"
    )


async def cached_or_compute(
    cache_key: str,
    ttl_seconds: int,
    compute: Callable[[], Awaitable[Any]],
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    validate: Optional[Callable[[Any], Optional[Any]]] = None,
) -> Optional[Any]:
    """
    Redis-cached, timeout-guarded compute.

    validate(raw) should return the validated value, or None if raw is
    malformed/untrusted — a None result is never cached, so the next caller
    in the segment retries rather than being stuck on a bad cached value.

    Returns None on cache-read failure + compute timeout/error + failed
    validation. Returns the cached/validated value otherwise.
    """
    try:
        from app.core.redis import redis_client
        cached = await redis_client.get(cache_key)
        if cached is not None:
            return cached
    except Exception as e:
        logger.warning("renderengine.cache_read_failed", cache_key=cache_key, error=str(e))

    try:
        raw = await asyncio.wait_for(compute(), timeout=timeout_seconds)
    except Exception as e:
        logger.warning("renderengine.compute_failed", cache_key=cache_key, error=str(e))
        return None

    result = validate(raw) if validate else raw
    if result is None:
        logger.warning("renderengine.validation_failed", cache_key=cache_key)
        return None

    try:
        from app.core.redis import redis_client
        await redis_client.set(cache_key, result, expire=ttl_seconds)
    except Exception as e:
        logger.warning("renderengine.cache_write_failed", cache_key=cache_key, error=str(e))

    return result


async def cached_or_warm(
    cache_key: str,
    ttl_seconds: int,
    compute: Callable[[], Awaitable[Any]],
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    validate: Optional[Callable[[Any], Optional[Any]]] = None,
) -> Optional[Any]:
    """
    Non-blocking variant of cached_or_compute for slow (web-grounded) sections.

    Returns the cached value immediately if present. On a cache MISS it does NOT
    block the caller on the (slow) compute -- it fires the compute as a detached
    background task (which caches on success) and returns None right away, so the
    customer welcome renders fast and the section populates on the next load.

    The background task uses cached_or_compute (never raises), so a failed warm
    just leaves the cache empty for the next attempt.
    """
    try:
        from app.core.redis import redis_client
        cached = await redis_client.get(cache_key)
        if cached is not None:
            return cached
    except Exception as e:
        logger.warning("renderengine.cache_read_failed", cache_key=cache_key, error=str(e))

    async def _warm() -> None:
        try:
            await cached_or_compute(
                cache_key, ttl_seconds, compute,
                timeout_seconds=timeout_seconds, validate=validate,
            )
        except Exception as e:   # cached_or_compute shouldn't raise, but never let a bg task escape
            logger.warning("renderengine.warm_failed", cache_key=cache_key, error=str(e))

    asyncio.create_task(_warm())
    return None

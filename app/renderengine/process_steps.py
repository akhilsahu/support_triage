"""
'How it works' process steps for the homepage 'process_steps' section.

A numbered journey block -- the genre-standard "file a claim in 3 steps" /
"get covered in 3 steps" a prospect expects. Grounded in this chatbot's own
KB (claim process, onboarding, etc.) via a single fast llm_service completion
(no web search needed -- the steps come from the bot's own documentation).

Own cache entry, own failure isolation. Empty list -> ProcessStepsSection.tsx
renders nothing (safe no-op).
"""
from __future__ import annotations

import json
from uuid import UUID

import structlog

from app.renderengine.base import cached_or_compute, chatbot_doc_types, sample_rag_content, sibling_note

logger = structlog.get_logger()

_CACHE_TTL_SECONDS = 60 * 60 * 4
_CACHE_KEY = "renderengine:process_steps:{chatbot_id}:{siblings}"
_COMPUTE_TIMEOUT_SECONDS = 6.0

_MAX_STEPS = 4
_MIN_STEPS = 2
_MAX_TITLE_CHARS = 48
_MAX_STEP_LABEL_CHARS = 28
_MAX_STEP_BODY_CHARS = 120


def _clip(s: object, n: int) -> str | None:
    if not isinstance(s, str) or not s.strip():
        return None
    return s.strip()[:n]


def _validate(raw: str) -> dict | None:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text.strip())
        if not isinstance(parsed, dict):
            return None

        title = _clip(parsed.get("title"), _MAX_TITLE_CHARS)
        raw_steps = parsed.get("steps")
        if not title or not isinstance(raw_steps, list):
            return None

        steps: list[dict] = []
        for s in raw_steps[:_MAX_STEPS]:
            if not isinstance(s, dict):
                continue
            label = _clip(s.get("label"), _MAX_STEP_LABEL_CHARS)
            body = _clip(s.get("body"), _MAX_STEP_BODY_CHARS)   # optional
            if label:
                steps.append({"label": label, "body": body or ""})
        if len(steps) < _MIN_STEPS:
            return None

        return {"title": title, "steps": steps}
    except Exception:
        return None


async def get_process_steps(
    *,
    chatbot_id: UUID,
    space_id: UUID,
    space_name: str,
    active_agents: list,
    other_sections: list[str] | None = None,
) -> dict | None:
    """Return a KB-grounded {title, steps[]} block, or None (safe no-op)."""
    siblings = ",".join(sorted(other_sections)) if other_sections else "none"
    cache_key = _CACHE_KEY.format(chatbot_id=chatbot_id, siblings=siblings)
    doc_types = chatbot_doc_types(active_agents)

    async def _compute() -> str:
        return await _generate(space_id, space_name, doc_types, other_sections)

    return await cached_or_compute(
        cache_key, _CACHE_TTL_SECONDS, _compute,
        timeout_seconds=_COMPUTE_TIMEOUT_SECONDS,
        validate=_validate,
    )


async def _generate(
    space_id: UUID, space_name: str, doc_types: list[str], other_sections: list[str] | None = None,
) -> str:
    from app.services.llm_service import llm_service

    rag_context = await sample_rag_content(
        space_id, doc_types, query_text="claim process steps how to apply eligibility procedure",
    )
    if not rag_context:
        # No KB content to ground a real process in -- don't invent steps.
        raise ValueError("no KB content available for process steps generation")

    system = (
        "You write a short 'how it works' step list for a customer support chat widget's welcome "
        "screen, based strictly on the knowledge base content provided.\n"
        "Rules:\n"
        '- Return ONLY one JSON object: {"title": "...", "steps": [{"label": "...", "body": "..."}, ...]}.\n'
        "- Pick the single most useful customer journey the content actually describes -- e.g. how "
        "to file a claim, how to buy/apply, how to renew. Do NOT invent steps not evidenced by the content.\n"
        f"- title: a short header naming the journey, under {_MAX_TITLE_CHARS} chars "
        '(e.g. "File a claim in 3 steps").\n'
        "- 3 steps ideally (2-4 allowed), in order.\n"
        f"- label: a 1-3 word step name, under {_MAX_STEP_LABEL_CHARS} chars (e.g. \"Intimate claim\").\n"
        f"- body: one short clarifying phrase, under {_MAX_STEP_BODY_CHARS} chars (optional, omit if not needed).\n"
        "- If the content doesn't describe a clear multi-step journey, return "
        '{"title": "", "steps": []}.\n'
        f"{sibling_note(other_sections)}"
        'Output: {"title": "File a claim in 3 steps", "steps": [{"label": "Intimate claim", "body": "..."}]}'
    )
    user = (
        f"Company: {space_name}\n"
        f"Knowledge base content sample:\n{rag_context}\n"
        "\nWrite the process steps."
    )
    result = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
        temperature=0.3,
        max_tokens=300,
    )
    content = (result or {}).get("content", "").strip()
    if not content:
        raise ValueError("empty LLM response")
    return content

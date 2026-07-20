"""
Trust-metrics stat band for the homepage 'stat_band' section.

The single most genre-defining block for insurance/finance bots: the big
headline numbers a prospect scans first (claim settlement ratio, lives
covered, claims paid, rating). Uses the same Agno + web-search agent as
data_block.py so figures can be grounded in real, current, publicly
published info (IRDAI ratios, company disclosures) rather than invented,
with KB content as the first grounding source.

Same safety boundary as the rest of renderengine: the model returns only a
fixed JSON shape (a list of {value, label}), rendered by a fixed frontend
component (StatBandSection.tsx). Never code/markup. Every band is force-tagged
illustrative with a disclaimer -- these are representative figures for display,
not a verified quote/guarantee.
"""
from __future__ import annotations

import json
from uuid import UUID

import structlog

from app.renderengine.base import (
    cached_or_compute, cached_or_warm, sibling_note, chatbot_doc_types, sample_rag_content,
)

logger = structlog.get_logger()

_CACHE_TTL_SECONDS = 60 * 60 * 24  # 24h -- web-grounded, doesn't need per-visitor freshness
_CACHE_KEY = "renderengine:stat_band:{chatbot_id}:{siblings}"
_COMPUTE_TIMEOUT_SECONDS = 12.0

_MAX_STATS = 4
_MIN_STATS = 2
_MAX_VALUE_CHARS = 14
_MAX_LABEL_CHARS = 26
_DEFAULT_DISCLAIMER = "Representative figures for reference -- confirm current numbers with the company."


def _clip(s: object, n: int) -> str | None:
    if not isinstance(s, str) or not s.strip():
        return None
    return s.strip()[:n]


def _validate(raw: str) -> dict | None:
    """Parse + strictly shape-check. None on anything malformed."""
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text.strip())
        if isinstance(parsed, list):        # tolerate a bare array
            parsed = {"stats": parsed}
        if not isinstance(parsed, dict):
            return None

        raw_stats = parsed.get("stats")
        if not isinstance(raw_stats, list):
            return None
        stats: list[dict] = []
        for s in raw_stats[:_MAX_STATS]:
            if not isinstance(s, dict):
                continue
            value = _clip(s.get("value"), _MAX_VALUE_CHARS)
            label = _clip(s.get("label"), _MAX_LABEL_CHARS)
            if value and label:
                stats.append({"value": value, "label": label})
        if len(stats) < _MIN_STATS:
            return None

        disclaimer = _clip(parsed.get("disclaimer"), 150) or _DEFAULT_DISCLAIMER
        return {"stats": stats, "illustrative": True, "disclaimer": disclaimer}
    except Exception:
        return None


# ── Admin-authored figures (verified, preferred over AI/web) ──────────────────

def admin_stat_band(metrics: list) -> dict | None:
    """
    Build the render dict from admin-authored ChatbotStatMetric rows (the brand's
    OWN verified figures). Preferred over the AI/web generator: accurate, instant,
    no web dependency, compliance-safe for a regulated brand. None when there
    aren't at least _MIN_STATS usable rows (-> falls back to AI/web).

    Accepts model rows or plain dicts (anything with .value/.label or ["value"]).
    """
    stats: list[dict] = []
    for m in metrics[:_MAX_STATS]:
        raw_value = m.get("value") if isinstance(m, dict) else getattr(m, "value", None)
        raw_label = m.get("label") if isinstance(m, dict) else getattr(m, "label", None)
        value = _clip(raw_value, _MAX_VALUE_CHARS)
        label = _clip(raw_label, _MAX_LABEL_CHARS)
        if value and label:
            stats.append({"value": value, "label": label})
    if len(stats) < _MIN_STATS:
        return None
    # Admin figures are verified by the brand -- no "illustrative" disclaimer.
    return {"stats": stats, "illustrative": False, "disclaimer": ""}


def validate_stat_metrics(items: list) -> list[dict]:
    """Validate an admin-submitted list of {value, label} before persisting
    (PUT /api/v1/chatbots/{slug}/stat-metrics). Raises ValueError on bad input;
    returns the cleaned list ([] clears all metrics)."""
    if items is None:
        return []
    if not isinstance(items, list):
        raise ValueError("stat metrics must be a list")
    if len(items) > _MAX_STATS:
        raise ValueError(f"stat_band supports at most {_MAX_STATS} metrics")
    cleaned: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("each stat metric must be an object")
        value, label = item.get("value"), item.get("label")
        if not isinstance(value, str) or not isinstance(label, str) or not value.strip() or not label.strip():
            raise ValueError("each stat metric needs non-empty 'value' and 'label' strings")
        cleaned.append({"value": value.strip()[:_MAX_VALUE_CHARS], "label": label.strip()[:_MAX_LABEL_CHARS]})
    return cleaned


# ── AI/web-generated fallback ─────────────────────────────────────────────────

async def get_stat_band(
    *,
    chatbot_id: UUID,
    space_id: UUID,
    space_name: str,
    description: str,
    active_agents: list,
    other_sections: list[str] | None = None,
    blocking: bool = True,
) -> dict | None:
    """Return a KB+web-grounded, illustrative stat band, or None (safe no-op).

    blocking=False (recommended on the customer path): serve cached or warm in
    the background and return None this request, so the welcome never waits on
    the slow web-grounded generation. Only used when the admin hasn't provided
    verified figures via parse_stat_band."""
    siblings = ",".join(sorted(other_sections)) if other_sections else "none"
    cache_key = _CACHE_KEY.format(chatbot_id=chatbot_id, siblings=siblings)
    doc_types = chatbot_doc_types(active_agents)

    async def _compute() -> str:
        return await _generate(space_id, space_name, description, active_agents, doc_types, other_sections)

    runner = cached_or_compute if blocking else cached_or_warm
    return await runner(
        cache_key, _CACHE_TTL_SECONDS, _compute,
        timeout_seconds=_COMPUTE_TIMEOUT_SECONDS,
        validate=_validate,
    )


async def _generate(
    space_id: UUID, space_name: str, description: str, active_agents: list,
    doc_types: list[str], other_sections: list[str] | None = None,
) -> str:
    try:
        from agno.agent import Agent
        from agno.tools.duckduckgo import DuckDuckGoTools
    except ImportError as e:
        raise ValueError(f"agno/ddgs not installed: {e}")

    from app.orchestra.ai.core.config import build_config
    from app.orchestra.ai.factories.llm import LLMFactory

    cfg = build_config()
    model = LLMFactory(cfg).build(temperature=0.3, max_tokens=400)
    if model is None:
        raise ValueError("no LLM provider available")

    rag_context = await sample_rag_content(
        space_id, doc_types, query_text="claim settlement ratio customers covered awards rating",
    )
    specialists = [a for a in active_agents if getattr(a, "slug", "") != "triage"]
    agent_lines = "\n".join(
        f"- {a.name}: {a.description or a.agent_type}" for a in specialists
    ) or "- General support agent"

    instructions = (
        "You produce a short 'trust metrics' band for a customer support chat widget's welcome "
        "screen -- the 2-4 headline numbers a prospective customer scans first (e.g. claim "
        "settlement ratio, customers/lives covered, claims paid, years in business, customer "
        "rating, awards).\n"
        "GROUNDING: use web search to find real, current, publicly published figures for this "
        "specific company. Use the knowledge base content in the user message as supporting "
        "context. If you cannot find a confident real figure, use a clearly plausible "
        "representative example rather than guessing at a precise real one.\n"
        "Rules:\n"
        '- Return ONLY one JSON object: {"stats": [{"value": "...", "label": "..."}, ...], '
        '"disclaimer": "..."} -- 2 to 4 stats.\n'
        f"- value: the number/figure, short (under {_MAX_VALUE_CHARS} chars, e.g. \"99.5%\", "
        '"6.8 Cr", "₹1.9L Cr", "4.6/5").\n'
        f"- label: what it measures, under {_MAX_LABEL_CHARS} chars (e.g. \"Claims settled\", "
        '"Lives covered").\n'
        "- disclaimer: one short sentence noting the figures are representative, not a guarantee.\n"
        "- Never present a figure as a verified guarantee. No markdown, no prose outside the JSON.\n"
        f"{sibling_note(other_sections)}"
        'Output: {"stats": [{"value": "99.5%", "label": "Claims settled"}], "disclaimer": "..."}'
    )
    user = (
        f"Company: {space_name}\n"
        f"Description: {description or '(none provided)'}\n"
        f"Support agents / topics:\n{agent_lines}\n"
        f"\nKnowledge base content (supporting context):\n{rag_context or '(none available)'}\n"
        "\nResearch this company and produce the trust metrics band."
    )

    agent = Agent(
        model=model,
        tools=[DuckDuckGoTools()],
        instructions=instructions,
        markdown=False,
        debug_mode=cfg.debug,
    )
    response = await agent.arun(user)
    content = (response.content if hasattr(response, "content") else str(response)) or ""
    content = content.strip()
    if not content:
        raise ValueError("empty agent response")
    return content

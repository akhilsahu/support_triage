"""
AI-recommended homepage section list for a chatbot's pre-chat empty state.

Selection flow: admin override on Chatbot.homepage_sections_override (if set)
always wins, no cache/LLM touched -> Redis cache per (chatbot, device,
visitor_type) segment -> LLM classification into ALLOWED_SECTIONS, timeout-
guarded via renderengine.base -> DEFAULT_SECTIONS on any miss.

Mirrors app/utils/ai/chat_suggestions.py; the cache/timeout/fallback
plumbing itself lives in app/renderengine/base.py.

app/api/space.py includes the result (plus per-section content) in the public
org response, and CustomerChat.tsx renders it via ui/src/renderengine/homepage/
SectionRenderer.tsx when the chatbot has homepage sections enabled.
"""
from __future__ import annotations

import json
from uuid import UUID

import structlog

from app.renderengine.base import cached_or_compute

logger = structlog.get_logger()

# Fixed, developer-maintained pool. The only way to add a new section type is
# to extend this list AND add a matching component to the frontend registry
# at ui/src/renderengine/homepage/registry.ts — the LLM never generates a
# section it isn't told about here.
ALLOWED_SECTIONS = ["hero", "key_benefits", "capabilities", "suggested_questions", "faq", "quick_topics", "trust_badges", "promo", "data_block", "stat_band", "process_steps", "comparison"]

# "promo", "quick_topics", and "trust_badges" are admin-authored only -- the
# AI is never allowed to select them, even though they're valid rendered
# section ids. quick_topics/trust_badges are force-included server-side
# (app/api/space.py) whenever the admin has actually configured content,
# regardless of this exclusion.
_AI_SELECTABLE_SECTIONS = [s for s in ALLOWED_SECTIONS if s not in ("promo", "quick_topics", "trust_badges")]

# Today's current empty-state behavior (hero + suggestion chips) -- returned
# whenever the engine can't produce a validated recommendation.
DEFAULT_SECTIONS = ["hero", "suggested_questions"]

_CACHE_TTL_SECONDS = 60 * 60 * 4  # 4h segment cache, not per-request
_CACHE_KEY = "renderengine:homepage_sections:{chatbot_id}:{device}:{visitor_type}"
_MAX_SECTIONS = 6       # caps the AI's own picks (see _validate below) -- matches the "3-6" pick range in the prompt
# The picker is on the blocking welcome path, but its result is cached 4h per
# segment, so only a rare cache-miss pays the LLM latency. A cold classification
# call measures ~2-2.5s here, so the shared 2.5s default timed out intermittently
# and dropped the whole recommendation to DEFAULT_SECTIONS -- give it real headroom.
_PICK_TIMEOUT_SECONDS = 6.0
_MAX_TOTAL_SECTIONS = 7  # caps the page after admin-authored sections are force-included

# Never dropped by cap_total_sections. Beyond hero: the primary "where do I
# start" CTA (suggested_questions) and every force-included, admin-authored
# section (quick_topics/trust_badges/promo) -- an admin who explicitly
# configured content, and the visitor's main call-to-action, must always
# survive the cap. Sections an admin explicitly listed in an override are
# additionally protected at the call site via protected_extra.
_PROTECTED_SECTIONS = {"hero", "suggested_questions", "quick_topics", "trust_badges", "promo"}


def cap_total_sections(
    sections: list[str],
    max_total: int = _MAX_TOTAL_SECTIONS,
    protected_extra: set[str] | None = None,
) -> list[str]:
    """
    Bound the total page length. Only *softer* AI-selected content picks
    (key_benefits/faq/data_block/capabilities/etc.) are trimmable -- hero,
    the suggested_questions CTA, force-included admin content, and any
    section an admin explicitly listed in their override (protected_extra)
    are never dropped. Trims from the tail of the trimmable portion only,
    preserving order.
    """
    protected = _PROTECTED_SECTIONS | (protected_extra or set())
    if len(sections) <= max_total:
        return sections
    protected_count = sum(1 for s in sections if s in protected)
    budget = max(0, max_total - protected_count)
    kept: list[str] = []
    trimmable_kept = 0
    for s in sections:
        if s in protected:
            kept.append(s)
        elif trimmable_kept < budget:
            kept.append(s)
            trimmable_kept += 1
    return kept


def _parse_override(raw: str | None) -> list[str] | None:
    """Parse Chatbot.homepage_sections_override. None/malformed -> no override."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        sections = data.get("sections") if isinstance(data, dict) else None
        if not isinstance(sections, list):
            return None
        validated = [s for s in sections if isinstance(s, str) and s in ALLOWED_SECTIONS]
        return validated or None
    except Exception:
        logger.warning("homepage_sections.override_parse_failed")
        return None


_MAX_PROMO_CHARS = 200


def parse_section_overrides(raw: str | None) -> dict | None:
    """
    Parse the "overrides" sub-object of Chatbot.homepage_sections_override --
    admin-authored content for sections the AI never generates (v1: only
    "promo"). Entirely optional: a chatbot that never sets this stays on
    pure AI-recommended behavior with no action required. None/malformed ->
    no overrides, same fail-safe style as _parse_override -- never blocks or
    errors the caller, just omits promo content.
    """
    if not raw:
        return None
    try:
        data = json.loads(raw)
        overrides = data.get("overrides") if isinstance(data, dict) else None
        if not isinstance(overrides, dict):
            return None

        promo = overrides.get("promo")
        if isinstance(promo, dict):
            text = promo.get("text")
            if isinstance(text, str) and text.strip():
                return {"promo": {"text": text.strip()[:_MAX_PROMO_CHARS]}}
        return None
    except Exception:
        logger.warning("homepage_sections.overrides_parse_failed")
        return None


def _validate(raw: str) -> list[str] | None:
    """Parse + validate the LLM's raw output. None on anything malformed."""
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return None

        seen: set[str] = set()
        sections: list[str] = []
        for s in parsed:
            if isinstance(s, str) and s in _AI_SELECTABLE_SECTIONS and s not in seen:
                seen.add(s)
                sections.append(s)
        sections = sections[:_MAX_SECTIONS]
        return sections or None
    except Exception:
        return None


def validate_override_payload(raw: str | None) -> str | None:
    """
    Validate an admin-submitted override payload (from ChatbotProfile / the
    PATCH /api/v1/chatbots/{slug} endpoint) before it's persisted to
    Chatbot.homepage_sections_override. Unlike _validate() above (which
    silently drops anything the AI gets wrong), this raises ValueError on bad
    input -- an admin submitting a form should get a clear 400, not a silent
    partial save.

    None/empty string clears the override (falls back to AI recommendation).
    """
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        raise ValueError("homepage_sections_override must be valid JSON")
    if not isinstance(data, dict):
        raise ValueError("homepage_sections_override must be a JSON object")

    sections = data.get("sections")
    if sections is not None:
        if not isinstance(sections, list) or not all(isinstance(s, str) for s in sections):
            raise ValueError("sections must be a list of strings")
        invalid = [s for s in sections if s not in ALLOWED_SECTIONS]
        if invalid:
            raise ValueError(f"unknown section id(s): {invalid}")

    # overrides is entirely optional -- admins who never set it are unaffected.
    overrides = data.get("overrides")
    if overrides is not None:
        if not isinstance(overrides, dict):
            raise ValueError("overrides must be a JSON object")
        promo = overrides.get("promo")
        if promo is not None:
            if not isinstance(promo, dict) or not isinstance(promo.get("text"), str) or not promo["text"].strip():
                raise ValueError("overrides.promo must be an object with a non-empty 'text' string")

    return raw


async def get_homepage_sections(
    *,
    chatbot_id: UUID,
    space_name: str,
    description: str,
    active_agents: list,
    device: str = "desktop",
    visitor_type: str = "new",
    override_raw: str | None = None,
) -> list[str]:
    """
    Return the ordered section ids to render in the pre-chat empty state.
    Always returns something -- never raises, never empty.
    """
    override = _parse_override(override_raw)
    if override:
        return override

    cache_key = _CACHE_KEY.format(chatbot_id=chatbot_id, device=device, visitor_type=visitor_type)

    async def _compute() -> str:
        return await _generate(space_name, description, active_agents)

    result = await cached_or_compute(
        cache_key,
        _CACHE_TTL_SECONDS,
        _compute,
        timeout_seconds=_PICK_TIMEOUT_SECONDS,
        validate=_validate,
    )
    return result or DEFAULT_SECTIONS


async def _generate(space_name: str, description: str, active_agents: list) -> str:
    """Ask the LLM which sections fit this bot. Raises on any provider failure
    (caller's timeout/try-except in cached_or_compute handles it)."""
    from app.services.llm_service import llm_service

    specialists = [a for a in active_agents if getattr(a, "slug", "") != "triage"]
    agent_lines = "\n".join(
        f"- {a.name}: {a.description or a.agent_type}" for a in specialists
    ) or "- General support agent"

    system = (
        "You choose which homepage sections to show a visitor before they start "
        "chatting with a customer support bot.\n"
        f"Allowed sections (choose 3-6, order matters): {', '.join(_AI_SELECTABLE_SECTIONS)}\n"
        "Rules:\n"
        "- Return ONLY a valid JSON array of section id strings, using only the allowed values.\n"
        "- Build a genuinely informative page, not a minimal one: a bare hero + questions is a "
        "poor welcome. For a product/policy/service-backed brand you should usually land on 4-6 "
        "sections that actually tell a prospect something (benefits, trust metrics, comparisons, "
        "process) -- not just the three safe defaults.\n"
        "- For trust/comparison-shopped genres (insurance, credit cards, banking, broadband/telecom, "
        "healthcare, investing) the highest-value sections for a prospect are 'stat_band' (headline "
        "credibility numbers) and 'comparison' (how the brand stacks up against named competitors). "
        "PREFER including BOTH for these genres unless the brand truly has no standout numbers and no "
        "meaningful competitor set. Do not default to the three safe sections for these genres.\n"
        "- 'hero' is almost always a good first section.\n"
        "- 'key_benefits' should almost always be included too -- for policy, plan, product, or "
        "service-backed bots (insurance, credit cards, subscriptions, financial products, etc.) the "
        "key benefits/features ARE the primary thing a new visitor wants to see, even from a brief "
        "company description alone. Only skip it if the description and agents give you truly nothing "
        "to work with (e.g. a generic, product-less support bot).\n"
        "- Include 'suggested_questions' unless the bot has no clear specialty.\n"
        "- Only include 'faq' if the company/agents suggest there's clear FAQ-style content.\n"
        "- Only include 'data_block' when the product has genuinely comparable/numeric content worth "
        "a table, chart, card, or tabs (e.g. pricing tiers, reward rates, coverage amounts, plan comparisons) "
        "-- its actual content is researched and designed separately, you're only deciding whether it's worth trying. "
        "A side-by-side COMPARISON table fits comparison-shopped genres (insurance policies/plans, credit card "
        "reward tiers, subscription plans) but NOT one-off products/services with nothing to compare -- only "
        "pick data_block when there is genuinely something comparable or numeric.\n"
        "- Include 'stat_band' for trust/credibility-driven genres (insurance, finance, healthcare) where headline "
        "metrics matter to a prospect (claim settlement ratio, customers served, rating) -- skip it when the "
        "business has no such standout numbers.\n"
        "- Include 'process_steps' when there's a clear multi-step customer journey worth showing (e.g. how to "
        "file a claim, how to apply/onboard) -- skip it for bots with no such process.\n"
        "- Include 'comparison' ONLY for comparison-shopped genres where prospects genuinely weigh named "
        "competitors (insurance plans, credit cards, broadband/telecom, banking products) -- never for one-off "
        "products/services with no meaningful competitor set. Its content is researched separately.\n"
        'Output format: ["hero", "key_benefits", "suggested_questions"]'
    )
    user = (
        f"Company: {space_name}\n"
        f"Description: {description or '(none provided)'}\n"
        f"Support agents:\n{agent_lines}\n"
        "\nChoose the homepage sections."
    )

    result = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
        temperature=0.3,
        max_tokens=150,
    )
    content = (result or {}).get("content", "").strip()
    if not content:
        raise ValueError("empty LLM response")
    return content

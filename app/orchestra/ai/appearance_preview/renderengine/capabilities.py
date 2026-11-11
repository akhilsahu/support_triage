"""
"What this bot can help with" for the homepage 'capabilities' section.

Unlike key_benefits/faq/data_block, this needs no LLM call and no cache --
active_agents (already resolved by the caller for the other generators) is
enough to produce real, accurate content deterministically and instantly.
Optional by nature: only invoked when "capabilities" is in the selected
section list; an empty/no-op result (CapabilitiesSection.tsx renders
nothing) is always a safe fallback.
"""
from __future__ import annotations

_MAX_CAPABILITIES = 4
_MAX_CHARS = 48

# Generic filler an agent description sometimes opens with -- stripped so the
# capability chip leads with the actual subject, not boilerplate.
_BOILERPLATE_PREFIXES = (
    "this agent provides information and support regarding",
    "this agent provides information and support for",
    "this agent helps with",
    "this agent handles",
    "provides information and support regarding",
    "i can help you with",
    "i can help with",
)


def _clean_label(text: str) -> str:
    """Strip leading boilerplate and truncate at a word boundary with an
    ellipsis -- never a mid-word cut like '...the HD'."""
    label = text.strip()
    low = label.lower()
    for prefix in _BOILERPLATE_PREFIXES:
        if low.startswith(prefix):
            label = label[len(prefix):].lstrip(" :,-").strip()
            break
    # Drop a trailing period so a chip doesn't read like a sentence.
    label = label.rstrip(".")
    if len(label) <= _MAX_CHARS:
        return label
    cut = label[:_MAX_CHARS].rsplit(" ", 1)[0].rstrip(",;:")
    return f"{cut}…" if cut else label[:_MAX_CHARS].rstrip() + "…"


def get_capabilities(active_agents: list) -> list[str]:
    """Return up to 4 short strings describing what this chatbot's active
    agents can help with, derived from their own name/description -- never
    invented, never an LLM call. Prefers the (crisp) agent name over the
    (often verbose, boilerplate) description; word-boundary truncated."""
    specialists = [a for a in active_agents if getattr(a, "slug", "") != "triage"]

    capabilities: list[str] = []
    seen: set[str] = set()
    for agent in specialists:
        name = (getattr(agent, "name", "") or "").strip()
        description = (getattr(agent, "description", "") or "").strip()
        # Name is usually the crisp subject (e.g. "HDFC Life Click 2 Protect");
        # fall back to the description only when there's no usable name.
        raw = name or description
        if not raw:
            continue
        label = _clean_label(raw)
        key = label.lower()
        if not label or key in seen:
            continue
        seen.add(key)
        capabilities.append(label)
        if len(capabilities) >= _MAX_CAPABILITIES:
            break

    return capabilities

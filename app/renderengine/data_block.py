"""
AI-designed, search-grounded data block for the homepage 'data_block' section.

Unlike key_benefits/faq (simple llm_service text completion), this uses a
dedicated Agno Agent equipped with a web-search tool (DuckDuckGoTools) so the
content can be grounded in real-world info about the org/product rather than
invented outright. The agent itself decides which block_type (table / chart /
card / tabs) best fits what it found -- the structural section-list picker in
homepage_sections.py only decides "is a data block worth trying," not its shape.

Same safety boundary as the rest of renderengine: the LLM never returns code,
JSX, or HTML -- only structured JSON matching one of the four fixed shapes
below, rendered by fixed frontend components (ui/src/renderengine/homepage/
DataBlockSection.tsx). All content is always treated as illustrative, not
verified fact -- every block is force-tagged illustrative=true with a
disclaimer, even if the agent's own output omits or alters those fields.

Isolation: this module only ever receives space_name/description/active_agents
for THIS chatbot (same inputs as key_benefits.py) -- it does not touch other
chatbots' data or the wider space.

NOTE ON VERIFICATION: unlike every other renderengine module, this one calls
out to a real Agno Agent + live web search, which can't be exercised with a
mocked unit test the way key_benefits/faq were. Use democheck.py (--data-block)
for a real end-to-end check once agno + duckduckgo-search are installed and an
LLM provider key is configured.
"""
from __future__ import annotations

import json
from uuid import UUID

import structlog

from app.renderengine.base import (
    cached_or_compute, sibling_note, chatbot_doc_types, sample_rag_content,
)

logger = structlog.get_logger()

_CACHE_TTL_SECONDS = 60 * 60 * 24  # 24h -- expensive (search + generation), doesn't need to be fresh per visitor
_CACHE_KEY = "renderengine:data_block:{chatbot_id}:{siblings}"
_COMPUTE_TIMEOUT_SECONDS = 12.0  # KB grounding + optional web search + generation; 8s was too tight and timed out

_ALLOWED_BLOCK_TYPES = ("table", "chart", "card", "tabs")
_ALLOWED_CHART_TYPES = ("bar", "line")
_DEFAULT_DISCLAIMER = "Illustrative example for reference only -- confirm exact figures with the company."

_MAX_TABLE_COLUMNS = 5
_MAX_TABLE_ROWS = 6
_MAX_CHART_POINTS = 8
_MAX_TABS = 4
_MAX_TITLE_CHARS = 60
_MAX_CELL_CHARS = 60
_MAX_TAB_BODY_CHARS = 300


def _clip(s: object, n: int) -> str | None:
    if not isinstance(s, str) or not s.strip():
        return None
    return s.strip()[:n]


def _validate(raw: str) -> dict | None:
    """Parse + strictly shape-check the agent's raw output. None on anything
    malformed or of an unrecognized block_type -- caller then has no data
    block, which DataBlockSection.tsx renders as nothing (safe no-op)."""
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text.strip())
        if not isinstance(parsed, dict):
            return None

        block_type = parsed.get("block_type")
        if block_type not in _ALLOWED_BLOCK_TYPES:
            return None

        title = _clip(parsed.get("title"), _MAX_TITLE_CHARS)
        if not title:
            return None

        raw_content = parsed.get("content")
        if not isinstance(raw_content, dict):
            return None

        content: dict | None = None

        if block_type == "table":
            columns = raw_content.get("columns")
            rows = raw_content.get("rows")
            if not isinstance(columns, list) or not isinstance(rows, list):
                return None
            columns = [c for c in (_clip(c, _MAX_CELL_CHARS) for c in columns[:_MAX_TABLE_COLUMNS]) if c]
            if not columns:
                return None
            clean_rows = []
            for row in rows[:_MAX_TABLE_ROWS]:
                if not isinstance(row, list):
                    continue
                cells = [c for c in (_clip(c, _MAX_CELL_CHARS) for c in row[:len(columns)]) if c is not None]
                if len(cells) == len(columns):
                    clean_rows.append(cells)
            if not clean_rows:
                return None
            content = {"columns": columns, "rows": clean_rows}

        elif block_type == "chart":
            chart_type = raw_content.get("chart_type")
            data = raw_content.get("data")
            if chart_type not in _ALLOWED_CHART_TYPES or not isinstance(data, list):
                return None
            clean_points = []
            for point in data[:_MAX_CHART_POINTS]:
                if not isinstance(point, dict):
                    continue
                label = _clip(point.get("label"), 30)
                value = point.get("value")
                if label is None or not isinstance(value, (int, float)):
                    continue
                clean_points.append({"label": label, "value": float(value)})
            if len(clean_points) < 2:
                return None
            content = {"chart_type": chart_type, "data": clean_points}

        elif block_type == "card":
            heading = _clip(raw_content.get("heading"), _MAX_TITLE_CHARS)
            value = _clip(raw_content.get("value"), 40)
            body = _clip(raw_content.get("body"), _MAX_TAB_BODY_CHARS)
            if not heading or not body:
                return None
            content = {"heading": heading, "value": value, "body": body}

        elif block_type == "tabs":
            tabs = raw_content.get("tabs")
            if not isinstance(tabs, list):
                return None
            clean_tabs = []
            for tab in tabs[:_MAX_TABS]:
                if not isinstance(tab, dict):
                    continue
                label = _clip(tab.get("label"), 30)
                body = _clip(tab.get("body"), _MAX_TAB_BODY_CHARS)
                if label and body:
                    clean_tabs.append({"label": label, "body": body})
            if len(clean_tabs) < 2:
                return None
            content = {"tabs": clean_tabs}

        if content is None:
            return None

        disclaimer = _clip(parsed.get("disclaimer"), 150) or _DEFAULT_DISCLAIMER

        # illustrative is always forced true -- never trust the model's own
        # claim either way, this block type is illustrative by definition.
        return {
            "block_type": block_type,
            "title": title,
            "illustrative": True,
            "disclaimer": disclaimer,
            "content": content,
        }
    except Exception:
        return None


async def get_data_block(
    *,
    chatbot_id: UUID,
    space_id: UUID,
    space_name: str,
    description: str,
    active_agents: list,
    other_sections: list[str] | None = None,
) -> dict | None:
    """Return a single KB-grounded (+ web-enriched), illustrative data block for
    this chatbot, or None (safe no-op -- DataBlockSection.tsx renders nothing).

    other_sections: ids of the other sections also selected for this page --
    included in the cache key so a different page composition doesn't reuse
    content nudged for a different sibling set."""
    siblings = ",".join(sorted(other_sections)) if other_sections else "none"
    cache_key = _CACHE_KEY.format(chatbot_id=chatbot_id, siblings=siblings)
    doc_types = chatbot_doc_types(active_agents)

    async def _compute() -> str:
        return await _generate(space_id, space_name, description, active_agents, doc_types, other_sections)

    return await cached_or_compute(
        cache_key,
        _CACHE_TTL_SECONDS,
        _compute,
        timeout_seconds=_COMPUTE_TIMEOUT_SECONDS,
        validate=_validate,
    )


async def _generate(
    space_id: UUID, space_name: str, description: str, active_agents: list,
    doc_types: list[str], other_sections: list[str] | None = None,
) -> str:
    """Run the KB-grounded research agent. Raises on any failure --
    caller's cached_or_compute handles timeout/exception -> None."""
    try:
        from agno.agent import Agent
        from agno.tools.duckduckgo import DuckDuckGoTools
    except ImportError as e:
        raise ValueError(f"agno/ddgs not installed: {e}")

    # Ground first in THIS bot's own docs (fast, local, accurate) -- the agent
    # then only needs web search to fill gaps, which keeps it inside budget
    # more often than a search-from-scratch run.
    rag_context = await sample_rag_content(
        space_id, doc_types, query_text="pricing coverage benefits eligibility plan comparison",
    )

    from app.orchestra.ai.core.config import build_config
    from app.orchestra.ai.factories.llm import LLMFactory

    cfg = build_config()
    model = LLMFactory(cfg).build(temperature=0.4, max_tokens=700)
    if model is None:
        raise ValueError("no LLM provider available")

    specialists = [a for a in active_agents if getattr(a, "slug", "") != "triage"]
    agent_lines = "\n".join(
        f"- {a.name}: {a.description or a.agent_type}" for a in specialists
    ) or "- General support agent"

    instructions = (
        "You design ONE data block for a customer support chat widget's welcome screen, "
        "for the company named below.\n"
        "GROUNDING PRIORITY:\n"
        "1. FIRST use the 'Knowledge base content' provided in the user message -- it is this "
        "company's own product documentation and is the most accurate source. Build the block "
        "from real figures found there wherever possible (premiums, coverage amounts, eligibility, "
        "plan tiers, process steps, etc.).\n"
        "2. ONLY use web search to fill a concrete gap the knowledge base doesn't cover. Don't "
        "search if the knowledge base already gives you enough to build a useful block -- that "
        "keeps it fast.\n"
        "3. If neither has confident real figures, invent clearly plausible illustrative example "
        "figures instead of guessing at real ones -- never present a guess as a verified fact.\n\n"
        "Pick exactly ONE block_type that best fits what you found:\n"
        '- "table": a comparison or tiered breakdown (e.g. plan tiers, reward rates by spend). '
        'content = {"columns": [string, ...], "rows": [[cell, ...], ...]} -- max 5 columns, 6 rows.\n'
        '- "chart": a trend or magnitude comparison better shown visually (e.g. reward growth by spend level). '
        'content = {"chart_type": "bar"|"line", "data": [{"label": string, "value": number}, ...]} -- 2-8 points.\n'
        '- "card": one single standout stat or fact, when there is nothing to tabulate '
        '(e.g. "Up to 10X reward points"). content = {"heading": string, "value": string, "body": string}.\n'
        '- "tabs": 2-4 distinct topics worth showing side by side with no natural table/chart '
        '(e.g. Coverage / Eligibility / Claim Process). content = {"tabs": [{"label": string, "body": string}, ...]}.\n\n'
        "Rules:\n"
        "- Return ONLY a single valid JSON object, no prose before or after, no markdown fences.\n"
        '- Always include: {"block_type": "...", "title": "...", "illustrative": true, '
        '"disclaimer": "...", "content": {...}}\n'
        "- title: short, under 60 characters.\n"
        "- disclaimer: one short sentence noting the figures are illustrative/example, not a quote or guarantee.\n"
        "- Never fabricate a specific named discount, rate, or promise as if verified -- if unsure, "
        "phrase it as a representative example.\n"
        f"{sibling_note(other_sections)}"
        'Output format: {"block_type": "table", "title": "...", "illustrative": true, "disclaimer": "...", '
        '"content": {"columns": [...], "rows": [[...]]}}'
    )
    user = (
        f"Company: {space_name}\n"
        f"Description: {description or '(none provided)'}\n"
        f"Support agents / topics:\n{agent_lines}\n"
        f"\nKnowledge base content (this company's own docs -- ground the block in this first):\n"
        f"{rag_context or '(no knowledge base content available -- use web search or illustrative examples)'}\n"
        "\nDesign the data block, grounding it in the knowledge base content above."
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

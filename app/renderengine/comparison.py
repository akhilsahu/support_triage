"""
Competitor comparison table for the homepage 'comparison' section.

Admin-curated grid (the brand's OWN verified, cited figures) is preferred and
compliance-safe for comparative claims about named competitors. When no admin
grid is set, an AI + web-search agent builds an illustrative comparison as a
best-effort fallback (always disclaimered, never presented as verified). Same
fixed-shape / fixed-renderer safety boundary as data_block.
"""
from __future__ import annotations

import json
from uuid import UUID

import structlog

from app.renderengine.base import (
    cached_or_compute, cached_or_warm, sibling_note, chatbot_doc_types, sample_rag_content,
)

logger = structlog.get_logger()

_CACHE_TTL_SECONDS = 60 * 60 * 24
_CACHE_KEY = "renderengine:comparison:{chatbot_id}:{siblings}"
_COMPUTE_TIMEOUT_SECONDS = 12.0

_MAX_COLS = 5
_MAX_ROWS = 6
_MIN_COLS = 2
_MIN_ROWS = 2
_MAX_CELL_CHARS = 40
_MAX_SOURCE_CHARS = 120
_DEFAULT_DISCLAIMER = "Illustrative comparison for reference only -- verify current figures with each provider."


def _clip(s: object, n: int) -> str | None:
    if not isinstance(s, str) or not s.strip():
        return None
    return s.strip()[:n]


def _clean_grid(columns: object, rows: object) -> tuple[list[str], list[list[str]]] | None:
    """Shared shape-check for both admin and AI grids. None if unusable."""
    if not isinstance(columns, list) or not isinstance(rows, list):
        return None
    cols = [c for c in (_clip(c, _MAX_CELL_CHARS) for c in columns[:_MAX_COLS]) if c]
    if len(cols) < _MIN_COLS:
        return None
    clean_rows: list[list[str]] = []
    for row in rows[:_MAX_ROWS]:
        if not isinstance(row, list):
            continue
        cells = [c if c is not None else "" for c in (_clip(x, _MAX_CELL_CHARS) for x in row[:len(cols)])]
        # pad short rows so every row matches the column count
        cells += [""] * (len(cols) - len(cells))
        if any(c.strip() for c in cells):
            clean_rows.append(cells)
    if len(clean_rows) < _MIN_ROWS:
        return None
    return cols, clean_rows


# ── Admin-curated (verified) ──────────────────────────────────────────────────

def admin_comparison(row) -> dict | None:
    """Build the render dict from an admin ChatbotComparison row. None if the
    stored grid is unusable (-> falls back to AI/web)."""
    if row is None:
        return None
    grid = _clean_grid(getattr(row, "columns", None), getattr(row, "rows", None))
    if grid is None:
        return None
    cols, rows = grid
    source = _clip(getattr(row, "source", None), _MAX_SOURCE_CHARS)
    # Admin figures are verified/cited by the brand -- not "illustrative".
    return {"columns": cols, "rows": rows, "source": source or "", "illustrative": False, "disclaimer": ""}


def validate_comparison(columns: object, rows: object, source: object) -> dict:
    """Validate an admin-submitted comparison grid before persisting
    (PUT /api/v1/chatbots/{slug}/comparison). Raises ValueError on bad input.
    Returns the cleaned {columns, rows, source}."""
    if not isinstance(columns, list) or not all(isinstance(c, str) for c in columns):
        raise ValueError("columns must be a list of strings")
    if not isinstance(rows, list) or not all(isinstance(r, list) for r in rows):
        raise ValueError("rows must be a list of string lists")
    cols = [c.strip()[:_MAX_CELL_CHARS] for c in columns if c.strip()]
    if not (_MIN_COLS <= len(cols) <= _MAX_COLS):
        raise ValueError(f"comparison needs {_MIN_COLS}-{_MAX_COLS} columns")
    clean_rows: list[list[str]] = []
    for r in rows[:_MAX_ROWS]:
        cells = [(str(x).strip()[:_MAX_CELL_CHARS] if x is not None else "") for x in r[:len(cols)]]
        cells += [""] * (len(cols) - len(cells))
        if any(c for c in cells):
            clean_rows.append(cells)
    if not (_MIN_ROWS <= len(clean_rows) <= _MAX_ROWS):
        raise ValueError(f"comparison needs {_MIN_ROWS}-{_MAX_ROWS} rows")
    src = (source or "")
    if not isinstance(src, str):
        raise ValueError("source must be a string")
    return {"columns": cols, "rows": clean_rows, "source": src.strip()[:_MAX_SOURCE_CHARS]}


# ── AI/web-generated fallback ─────────────────────────────────────────────────

def _validate_ai(raw: str) -> dict | None:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text.strip())
        if not isinstance(parsed, dict):
            return None
        grid = _clean_grid(parsed.get("columns"), parsed.get("rows"))
        if grid is None:
            return None
        cols, rows = grid
        source = _clip(parsed.get("source"), _MAX_SOURCE_CHARS)
        disclaimer = _clip(parsed.get("disclaimer"), 150) or _DEFAULT_DISCLAIMER
        return {
            "columns": cols, "rows": rows, "source": source or "",
            "illustrative": True, "disclaimer": disclaimer,
        }
    except Exception:
        return None


async def get_comparison(
    *,
    chatbot_id: UUID,
    space_id: UUID,
    space_name: str,
    description: str,
    active_agents: list,
    other_sections: list[str] | None = None,
    blocking: bool = True,
) -> dict | None:
    """AI/web-generated illustrative competitor comparison, or None (safe no-op).
    Only used when the admin hasn't curated a verified grid."""
    siblings = ",".join(sorted(other_sections)) if other_sections else "none"
    cache_key = _CACHE_KEY.format(chatbot_id=chatbot_id, siblings=siblings)
    doc_types = chatbot_doc_types(active_agents)

    async def _compute() -> str:
        return await _generate(space_id, space_name, description, active_agents, doc_types, other_sections)

    runner = cached_or_compute if blocking else cached_or_warm
    return await runner(
        cache_key, _CACHE_TTL_SECONDS, _compute,
        timeout_seconds=_COMPUTE_TIMEOUT_SECONDS,
        validate=_validate_ai,
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
    model = LLMFactory(cfg).build(temperature=0.3, max_tokens=700)
    if model is None:
        raise ValueError("no LLM provider available")

    rag_context = await sample_rag_content(
        space_id, doc_types, query_text="plan features premium coverage comparison competitors",
    )

    instructions = (
        "You build ONE competitor comparison table for a customer support chat widget's welcome "
        "screen, for the company named below. Use web search to find real, current, publicly "
        "published figures comparing this company's main product to 1-3 well-known competitors on "
        "2-4 meaningful metrics (e.g. claim settlement ratio, premium, cover, key feature).\n"
        "SAFETY:\n"
        "- These figures are ILLUSTRATIVE and must be disclaimered as such. Never present a competitor "
        "number as a verified fact or guarantee.\n"
        "- If you cannot find a confident real figure, use a clearly representative example rather than "
        "inventing a precise wrong one, and keep the disclaimer prominent.\n"
        "- Be neutral and factual; do not disparage competitors.\n"
        "Rules:\n"
        '- Return ONLY one JSON object: {"columns": [string,...], "rows": [[cell,...],...], '
        '"source": "...", "disclaimer": "..."}.\n'
        f"- 2-{_MAX_COLS} columns, 2-{_MAX_ROWS} rows. First column = provider/plan name, first row = "
        "this company. Each row's cell count matches the columns.\n"
        "- source: where the figures come from if known (e.g. \"IRDAI FY2023-24\"), else empty string.\n"
        "- disclaimer: one short sentence noting the comparison is illustrative, not verified.\n"
        f"{sibling_note(other_sections)}"
        'Output: {"columns": ["Provider","Claim ratio","Premium/mo"], "rows": [["'
        + space_name + '","...","..."]], "source": "...", "disclaimer": "..."}'
    )
    user = (
        f"Company: {space_name}\n"
        f"Description: {description or '(none provided)'}\n"
        f"\nKnowledge base (this company's own product context):\n{rag_context or '(none available)'}\n"
        "\nResearch and build the competitor comparison table."
    )

    agent = Agent(model=model, tools=[DuckDuckGoTools()], instructions=instructions,
                  markdown=False, debug_mode=cfg.debug)
    response = await agent.arun(user)
    content = (response.content if hasattr(response, "content") else str(response)) or ""
    content = content.strip()
    if not content:
        raise ValueError("empty agent response")
    return content

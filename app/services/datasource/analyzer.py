"""Safe, review-only analysis of representative data-source responses."""

from __future__ import annotations

import json
from dataclasses import dataclass, replace
from collections.abc import Awaitable, Callable
from typing import Any

from app.services.datasource.contracts import DataSourceDraft
from app.services.datasource.sanitizer import sanitize_mapping


CANONICAL_ALIASES = {
    "id": ("id", "order_id", "orderid", "reference", "ref"),
    "status": ("status", "state", "order_status"),
    "customer_name": ("customer_name", "customer", "name"),
    "total": ("total", "amount", "order_total"),
    "tracking": ("tracking", "tracking_number", "tracking_no"),
}


@dataclass(frozen=True, slots=True)
class AgentSummary:
    id: str
    name: str
    kind: str


@dataclass(frozen=True, slots=True)
class AnalyzedDraft:
    draft: DataSourceDraft
    sample_record: dict[str, Any]
    observed_fields: tuple[str, ...]
    suggested_agent_ids: tuple[str, ...] = ()
    ai_used: bool = False
    warnings: tuple[str, ...] = ()


def _candidate_arrays(value: Any, path: str = "", depth: int = 0) -> list[tuple[int, str, list[dict[str, Any]]]]:
    if depth > 8:
        return []
    found: list[tuple[int, str, list[dict[str, Any]]]] = []
    if isinstance(value, list) and value and all(isinstance(item, dict) for item in value[:20]):
        # Prefer populated arrays, then arrays with richer representative records.
        found.append((min(len(value), 20) * 100 + len(value[0]), path, value))
    elif isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            found.extend(_candidate_arrays(child, child_path, depth + 1))
    return found


def _record_and_path(sample: Any) -> tuple[dict[str, Any], str]:
    candidates = _candidate_arrays(sample)
    if candidates:
        _, path, records = max(candidates, key=lambda item: item[0])
        return dict(records[0]), path
    if isinstance(sample, dict):
        return dict(sample), ""
    raise ValueError("Sample must contain an object or a non-empty array of objects")


def _flat_paths(value: dict[str, Any], prefix: str = "", depth: int = 0) -> list[str]:
    paths: list[str] = []
    for key, child in value.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(child, dict) and depth < 4:
            paths.extend(_flat_paths(child, path, depth + 1))
        else:
            paths.append(path)
    return paths


async def analyze_sample(
    draft: DataSourceDraft,
    sample: Any,
    agents: list[AgentSummary] | None = None,
    use_ai: bool = False,
    llm_generate: Callable[..., Awaitable[dict[str, Any] | None]] | None = None,
) -> AnalyzedDraft:
    """Infer structural mappings, then optionally accept strictly validated AI hints."""
    clean_sample = sanitize_mapping(sample)
    record, record_path = _record_and_path(clean_sample)
    observed = tuple(_flat_paths(record))
    by_leaf = {path.rsplit(".", 1)[-1].lower(): path for path in observed}
    mapping: dict[str, str] = {}
    for target, aliases in CANONICAL_ALIASES.items():
        match = next((by_leaf[a] for a in aliases if a in by_leaf), None)
        if match:
            mapping[target] = match

    suggested_agents: tuple[str, ...] = ()
    warnings: list[str] = []
    ai_used = False
    if use_ai:
        try:
            if llm_generate is None:
                from app.services.llm_service import llm_service

                llm_generate = llm_service.generate_with_fallback

            prompt = {
                "observed_fields": observed,
                "current_mapping": mapping,
                "agents": [{"id": a.id, "name": a.name, "kind": a.kind} for a in (agents or [])],
                "instruction": "Return JSON with mapping and agent_ids. Use only supplied values.",
            }
            result = await llm_generate(
                messages=[{"role": "user", "content": json.dumps(prompt)}], temperature=0.1, max_tokens=500
            )
            parsed = json.loads((result or {}).get("content", "{}"))
            proposed = parsed.get("mapping", {})
            if isinstance(proposed, dict):
                mapping.update({str(k): v for k, v in proposed.items() if isinstance(v, str) and v in observed})
            active_ids = {a.id for a in (agents or [])}
            proposed_ids = parsed.get("agent_ids", [])
            if isinstance(proposed_ids, list):
                suggested_agents = tuple(str(value) for value in proposed_ids if str(value) in active_ids)
            ai_used = True
        except Exception:
            warnings.append("AI suggestions were unavailable; deterministic suggestions are shown")

    tool = replace(draft.tool, record_path=record_path, output_mapping=mapping)
    return AnalyzedDraft(
        draft=replace(draft, tool=tool), sample_record=record,
        observed_fields=observed, suggested_agent_ids=suggested_agents,
        ai_used=ai_used, warnings=tuple(warnings),
    )


__all__ = ["AgentSummary", "AnalyzedDraft", "analyze_sample"]

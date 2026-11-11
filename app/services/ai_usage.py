"""Fail-open AI usage recorder.

Mirrors app/services/conversation_events.py: independent transaction,
fail-open — a telemetry failure must never break the user-facing AI call.
"""
from typing import Any, Dict, Optional
from decimal import Decimal

import structlog

from app.models.ai_usage import AiUsageEvent
from app.services.ai_usage_context import get_ai_usage_context

logger = structlog.get_logger()

# Rough estimator when a provider reports no usage (watsonx plain-text API).
CHARS_PER_TOKEN = 4


def estimate_cost(provider, model, prompt_tokens, completion_tokens):
    """Configured list-rate estimate; excludes invoice discounts and adjustments."""
    from app.config import settings

    rates = settings.AI_USAGE_PRICING.get(f"{provider}:{model}")
    if (rates is None or prompt_tokens is None or completion_tokens is None
            or prompt_tokens < 0 or completion_tokens < 0):
        return None
    return (Decimal(prompt_tokens) * Decimal(str(rates["input_per_million"]))
            + Decimal(completion_tokens) * Decimal(str(rates["output_per_million"]))) / 1_000_000


def estimate_tokens(text: str) -> int:
    """~4 chars per token; 1 minimum for non-empty input."""
    if not text:
        return 0
    return max(1, len(text) // CHARS_PER_TOKEN)


def build_usage_event(
    *,
    kind: str,
    provider: str,
    model: str,
    latency_ms: int,
    usage: Optional[Dict[str, Any]] = None,
    estimated: bool = False,
    ok: bool = True,
    error_type: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> AiUsageEvent:
    """Build an AiUsageEvent row with ContextVar attribution applied.

    `usage` accepts OpenAI-style ({prompt_tokens, completion_tokens, total_tokens})
    or Anthropic-style ({input_tokens, output_tokens}) dicts; None → NULL columns.
    """
    ctx = get_ai_usage_context()
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    if usage:
        prompt = usage.get("prompt_tokens", usage.get("input_tokens"))
        completion = usage.get("completion_tokens", usage.get("output_tokens"))
        prompt_tokens = int(prompt) if prompt is not None else None
        completion_tokens = int(completion) if completion is not None else None
        total_tokens = usage.get("total_tokens")
        if total_tokens is None and prompt_tokens is not None and completion_tokens is not None:
            total_tokens = prompt_tokens + completion_tokens
    cost = estimate_cost(provider, model, prompt_tokens, completion_tokens)
    if ctx.cost is not None:
        ctx.cost.add(cost)
    return AiUsageEvent(
        space_id=ctx.space_id,
        chatbot_id=ctx.chatbot_id,
        kb_id=ctx.kb_id,
        session_id=ctx.session_id,
        message_id=ctx.message_id,
        product=ctx.product,
        runtime_kind=ctx.runtime_kind,
        aura_id=ctx.aura_id,
        aura_version_id=ctx.aura_version_id,
        aura_run_id=ctx.aura_run_id,
        kind=kind,
        provider=provider,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        estimated=estimated,
        cost_usd=cost,
        latency_ms=latency_ms,
        ok=ok,
        error_type=error_type,
        meta={**(meta or {}), "cost_basis": "configured_token_rates" if cost is not None else "unpriced"},
    )


def track_usage(**kwargs) -> None:
    """Record from async callers or AnyIO parser workers without blocking AI work."""
    import asyncio
    import anyio

    built = False
    try:
        usage = kwargs.get("usage")
        if usage is not None and not isinstance(usage, dict):
            dump = getattr(usage, "model_dump", None)
            kwargs["usage"] = dump() if callable(dump) else dict(usage)
        event = build_usage_event(**kwargs)
        built = True

        def schedule():
            asyncio.get_running_loop().create_task(record_usage_event(event))

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            anyio.from_thread.run_sync(schedule)
        else:
            schedule()
    except Exception as error:
        ctx = get_ai_usage_context()
        if not built and ctx.cost is not None:
            ctx.cost.add(None)
        logger.warning("ai_usage.track_failed", error_type=type(error).__name__)


async def record_usage_event(event: AiUsageEvent) -> None:
    """Persist in an independent transaction; log-and-swallow any failure."""
    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            db.add(event)
            await db.commit()
    except Exception as e:
        logger.warning("ai_usage.record_failed", error=str(e),
                       kind=event.kind, model=event.model)

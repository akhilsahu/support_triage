"""Fail-open AI usage recorder.

Mirrors app/services/conversation_events.py: independent transaction,
fail-open — a telemetry failure must never break the user-facing AI call.
"""
from typing import Any, Dict, Optional

import structlog

from app.models.ai_usage import AiUsageEvent
from app.services.ai_usage_context import get_ai_usage_context

logger = structlog.get_logger()

# Rough estimator when a provider reports no usage (watsonx plain-text API).
CHARS_PER_TOKEN = 4


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
        prompt_tokens = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
        total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
    return AiUsageEvent(
        space_id=ctx.space_id,
        chatbot_id=ctx.chatbot_id,
        kb_id=ctx.kb_id,
        session_id=ctx.session_id,
        message_id=ctx.message_id,
        kind=kind,
        provider=provider,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        estimated=estimated,
        cost_usd=None,
        latency_ms=latency_ms,
        ok=ok,
        error_type=error_type,
        meta=meta,
    )


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

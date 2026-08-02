"""
Vision completions with automatic OpenRouter fallback.

The ingestion parsers (PdfParser, ImageParser) call the OpenAI SDK directly
for GPT-4o mini vision, so they bypass the Agno fallback chain in
factories/llm.py. This module gives them the same escape hatch: when the
OpenAI account is rate-limited or out of credits, the identical request is
retried through OpenRouter (which proxies OpenAI models behind one key).

OpenRouter model ids use a "<provider>/<model>" prefix (e.g. "openai/gpt-4o-mini"),
so a bare OpenAI id is prefixed on fallback.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger()

_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _is_quota_or_rate_limit(exc: Exception) -> bool:
    """402 (payment required) / 429 (rate limit or out of credits)."""
    return getattr(exc, "status_code", None) in (402, 429)


def vision_completion(model: str, max_tokens: int, messages: list) -> str:
    """Run a vision chat completion, falling back to OpenRouter on quota/limit errors."""
    from openai import OpenAI

    from app.config import settings

    try:
        resp = OpenAI(api_key=settings.OPENAI_API_KEY).chat.completions.create(
            model=model, max_tokens=max_tokens, messages=messages,
        )
        return resp.choices[0].message.content or ""
    except Exception as e:
        if not _is_quota_or_rate_limit(e) or not settings.OPENROUTER_API_KEY:
            raise
        logger.warning("ingestion.vision.openai_failed_using_openrouter",
                       error=str(e))
        router_model = model if "/" in model else f"openai/{model}"
        resp = OpenAI(base_url=_OPENROUTER_BASE_URL,
                      api_key=settings.OPENROUTER_API_KEY).chat.completions.create(
            model=router_model, max_tokens=max_tokens, messages=messages,
        )
        return resp.choices[0].message.content or ""

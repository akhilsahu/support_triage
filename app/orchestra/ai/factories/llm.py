"""
LLMFactory — builds Agno model objects from AgnoConfig.

Adding a new LLM provider (e.g. Gemini):
    1. Add a _build_<provider>() function below
    2. Register it in _PROVIDERS
    3. Add GEMINI_API_KEY detection in core/config.py build_config()
    That's it — fallback chain picks it up automatically.
"""

from __future__ import annotations

from typing import Any, Callable, Optional
import structlog

from app.orchestra.ai.core.config import AgnoConfig

logger = structlog.get_logger()


# ── Per-provider builders ─────────────────────────────────────────────────────

def _uses_max_completion_tokens(model_id: str) -> bool:
    """
    OpenAI's reasoning-model family (o1/o3/o4, gpt-5*) rejects the `max_tokens`
    param outright and requires `max_completion_tokens` instead. Without this,
    every call to one of these models fails at the API, and — because nothing
    downstream distinguishes an API error from a real answer — the raw error
    string was silently returned to the customer as the reply. Confirmed
    against gpt-5-mini; see docs/ambiguous-question-clarification-plan.md,
    "gpt-5-mini never ran".

    NOTE: this family may also reject a custom `temperature` (fixed at 1 on
    o1/o3) — not confirmed here, so not "fixed" by guessing; only the measured
    max_tokens failure is addressed.
    """
    m = (model_id or "").lower()
    return m.startswith(("gpt-5", "o1", "o3", "o4"))


def _build_openai(cfg: AgnoConfig, temperature: float, max_tokens: int) -> Optional[Any]:
    try:
        from app.config import settings
        if not settings.OPENAI_API_KEY:
            return None
        from agno.models.openai import OpenAIChat
        model_id = cfg.llm_model or "gpt-4o-mini"
        kwargs: dict = dict(id=model_id, api_key=settings.OPENAI_API_KEY, temperature=temperature)
        if _uses_max_completion_tokens(model_id):
            kwargs["max_completion_tokens"] = max_tokens
        else:
            kwargs["max_tokens"] = max_tokens
        return OpenAIChat(**kwargs)
    except Exception as e:
        logger.warning("llm.openai_failed", error=str(e))
        return None


def _build_anthropic(cfg: AgnoConfig, _temperature: float, max_tokens: int) -> Optional[Any]:
    try:
        from agno.models.anthropic import Claude
        return Claude(id=cfg.llm_model or "claude-3-haiku-20240307", max_tokens=max_tokens)
    except Exception as e:
        logger.warning("llm.anthropic_failed", error=str(e))
        return None


def _build_watsonx(cfg: AgnoConfig, _temperature: float, _max_tokens: int) -> Optional[Any]:
    try:
        from app.config import settings
        if not (settings.WATSONX_API_KEY and settings.WATSONX_URL and settings.WATSONX_PROJECT_ID):
            return None
        from agno.models.ibm import WatsonX
        return WatsonX(
            id=cfg.llm_model or "ibm/granite-13b-chat-v2",
            api_key=settings.WATSONX_API_KEY,
            url=settings.WATSONX_URL,
            project_id=settings.WATSONX_PROJECT_ID,
        )
    except Exception as e:
        logger.warning("llm.watsonx_failed", error=str(e))
        return None


# Registry — add new providers here, nothing else changes
_PROVIDERS: dict[str, Callable] = {
    "openai":    _build_openai,
    "anthropic": _build_anthropic,
    "watsonx":   _build_watsonx,
}


# ── Factory ───────────────────────────────────────────────────────────────────

class LLMFactory:
    """Builds Agno-compatible LLM model instances from config."""

    def __init__(self, cfg: AgnoConfig):
        self.cfg = cfg

    def build(
        self,
        temperature: Optional[float] = None,
        max_tokens:  Optional[int]   = None,
        provider:    Optional[str]   = None,
    ) -> Optional[Any]:
        t = temperature if temperature is not None else self.cfg.temperature
        m = max_tokens  if max_tokens  is not None else self.cfg.max_tokens
        p = provider    if provider    is not None else self.cfg.llm_provider

        # Try preferred provider first, then all others in registration order
        fallback = [p] + [k for k in _PROVIDERS if k != p]
        for attempt in fallback:
            builder = _PROVIDERS.get(attempt)
            if not builder:
                continue
            model = builder(self.cfg, t, m)
            if model is not None:
                if attempt != p:
                    logger.warning("llm.fallback_used", requested=p, used=attempt)
                return model

        logger.error("llm.all_providers_failed", tried=fallback)
        return None

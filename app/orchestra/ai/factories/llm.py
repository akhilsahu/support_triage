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


def _build_openrouter(cfg: AgnoConfig, temperature: float, max_tokens: int) -> Optional[Any]:
    """
    OpenRouter proxies many providers' models behind one API key/endpoint —
    the escape hatch when a direct provider account (OpenAI, here) is
    rate-limited or exhausted. `cfg.llm_model` for this provider is an
    OpenRouter model id (e.g. "openai/gpt-4o-mini", "anthropic/claude-3-haiku"
    — see https://openrouter.ai/models), not a bare OpenAI model id.

    Only `max_tokens` — unlike OpenAIChat, agno's OpenRouter class has no
    `max_completion_tokens` field, so _uses_max_completion_tokens's gpt-5/o1
    branch does not apply here regardless of which underlying model an
    OpenRouter model id names.
    """
    try:
        from app.config import settings
        if not settings.OPENROUTER_API_KEY:
            return None
        from agno.models.openrouter import OpenRouter
        return OpenRouter(
            id=cfg.llm_model or settings.OPENROUTER_MODEL,
            api_key=settings.OPENROUTER_API_KEY,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as e:
        logger.warning("llm.openrouter_failed", error=str(e))
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
    "openrouter": _build_openrouter,
    "openai":     _build_openai,
    "anthropic":  _build_anthropic,
    "watsonx":    _build_watsonx,
}

# Each provider's OWN default model id, read at fallback-build time. Building
# a FALLBACK model must never reuse cfg.llm_model as-is — that field holds the
# PRIMARY provider's chosen model, and it is not a valid id for a different
# provider (an OpenAI id like "gpt-4o-mini" is not a valid OpenRouter id,
# which needs a "provider/model" prefix).
def _default_model_for(provider: str) -> Optional[str]:
    from app.config import settings
    return {
        "openai":     settings.OPENAI_MODEL,
        "openrouter": settings.OPENROUTER_MODEL,
        "anthropic":  settings.ANTHROPIC_MODEL,
        "watsonx":    settings.WATSONX_MODEL,
    }.get(provider)


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

    def build_fallbacks(
        self,
        temperature: Optional[float] = None,
        max_tokens:  Optional[int]   = None,
    ) -> list:
        """
        Build one Model instance per cfg.llm_fallback_providers, in order, for
        Agno's native `fallback_models=` (agno/models/fallback.py). Agno
        retries a LIVE call through these, in order, when the primary model
        raises a retryable ModelProviderError — rate limit (429), timeout,
        5xx, or context-window-exceeded.

        Deliberately NOT covered: 401/403 auth errors. Agno's own
        get_fallback_models() excludes non-retryable 4xx client errors from
        the general fallback list on purpose — a bad/expired API key is a
        configuration bug the developer needs to see, not one a fallback
        provider should silently paper over. If the primary key is genuinely
        invalid, this run still fails (safely — see _run_error_status in
        orchestrators/agno.py, which returns the fallback message rather than
        leaking the raw error), it just doesn't retry through OpenRouter.
        """
        t = temperature if temperature is not None else self.cfg.temperature
        m = max_tokens  if max_tokens  is not None else self.cfg.max_tokens

        models = []
        for name in self.cfg.llm_fallback_providers:
            builder = _PROVIDERS.get(name)
            if not builder:
                continue
            from dataclasses import replace
            fallback_cfg = replace(self.cfg, llm_model=_default_model_for(name))
            model = builder(fallback_cfg, t, m)
            if model is not None:
                models.append(model)
        return models

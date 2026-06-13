"""
LLMFactory — builds Agno model objects from AgnoConfig.

Provider priority (from .env):
    LLM_PROVIDER=watsonx   → ibm/granite-*
    LLM_PROVIDER=anthropic → claude-*
    LLM_PROVIDER=openai    → gpt-*   (default)

Fallback chain: if the preferred provider fails to build, we try the next one.

Adding a new provider:
    1. Add a branch in _build_for_provider()
    2. Add env vars to core/config.py
    3. No other files need to change
"""

from __future__ import annotations
from typing import Any, Optional
import structlog

from app.orchestra.ai.core.config import AgnoConfig
from app.orchestra.ai.core.models import LLMModels

logger = structlog.get_logger()


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
        """
        Build a model instance for the configured (or overridden) provider.

        Falls back through watsonx → anthropic → openai if the preferred
        provider fails (import error or missing credentials).

        Args:
            temperature: Per-call override; falls back to cfg.temperature
            max_tokens:  Per-call override; falls back to cfg.max_tokens
            provider:    Force a specific provider, bypassing cfg.llm_provider
        """
        t = temperature if temperature is not None else self.cfg.temperature
        m = max_tokens  if max_tokens  is not None else self.cfg.max_tokens
        p = provider    if provider    is not None else self.cfg.llm_provider

        # Try preferred provider first, then fall back
        fallback_order = self._fallback_chain(p)
        for attempt_provider in fallback_order:
            model = self._build_for_provider(attempt_provider, t, m)
            if model is not None:
                if attempt_provider != p:
                    logger.warning(
                        "llm_factory.fallback_used",
                        requested=p,
                        used=attempt_provider,
                    )
                return model

        logger.error("llm_factory.all_providers_failed", tried=fallback_order)
        return None

    # ── Private ───────────────────────────────────────────────────────────────

    @staticmethod
    def _fallback_chain(preferred: str) -> list[str]:
        """Return providers in fallback order, starting with the preferred one."""
        all_providers = ["watsonx", "anthropic", "openai"]
        ordered = [preferred] + [p for p in all_providers if p != preferred]
        return ordered

    def _build_for_provider(
        self,
        provider:    str,
        temperature: float,
        max_tokens:  int,
    ) -> Optional[Any]:
        """Build a model for a specific provider. Returns None on any failure."""
        try:
            if provider == "anthropic":
                return LLMModels.build_anthropic(self.cfg.llm_model, max_tokens)
            if provider == "watsonx":
                return LLMModels.build_watsonx(self.cfg.llm_model)
            return LLMModels.build_openai(self.cfg.llm_model, temperature, max_tokens)
        except Exception as e:
            logger.error("llm_factory.build_error", provider=provider, error=str(e))
            return None

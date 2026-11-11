"""One Agno model-chain builder backed by canonical configured clients."""
from __future__ import annotations

from dataclasses import replace
from typing import Any, Optional
import structlog

from app.orchestra.ai.config import OrchestraConfig

logger = structlog.get_logger()

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


def _supports_reasoning_effort(model_id: str) -> bool:
    """
    OpenAI's `reasoning_effort` request argument is only accepted by its
    reasoning-model family (o1/o3/o4, gpt-5*) — the same family that requires
    `max_completion_tokens`. Non-reasoning models (gpt-4o, gpt-4o-mini, …)
    reject it with a 400 (`Unrecognized request argument supplied:
    reasoning_effort`), which surfaced as "Error in Team run" and an empty /
    error reply to the customer. So the effort override is only forwarded to
    models that actually accept it.

    Handles both bare OpenAI ids ("gpt-5-mini") and OpenRouter-style prefixed
    ids ("openai/gpt-5-mini", "anthropic/claude-…" → unsupported).
    """
    m = (model_id or "").lower()
    if "/" in m:
        m = m.split("/", 1)[1]
    return m.startswith(("gpt-5", "o1", "o3", "o4"))


def _build_anthropic(
    cfg: OrchestraConfig,
    _temperature: float,
    max_tokens: int,
    model: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> Optional[Any]:
    try:
        from app.config import settings
        if not settings.ANTHROPIC_API_KEY:
            return None
        from agno.models.anthropic import Claude
        return Claude(id=model or cfg.llm_model or "claude-3-haiku-20240307",
                      api_key=settings.ANTHROPIC_API_KEY, max_tokens=max_tokens)
    except Exception as e:
        logger.warning("llm.anthropic_failed", error=str(e))
        return None


def _build_watsonx(
    cfg: OrchestraConfig,
    _temperature: float,
    _max_tokens: int,
    model: Optional[str] = None,
    reasoning_effort: Optional[str] = None,
) -> Optional[Any]:
    try:
        from app.config import settings
        if not (settings.WATSONX_API_KEY and settings.WATSONX_URL and settings.WATSONX_PROJECT_ID):
            return None
        from agno.models.ibm import WatsonX
        return WatsonX(
            id=model or cfg.llm_model or "ibm/granite-13b-chat-v2",
            api_key=settings.WATSONX_API_KEY,
            url=settings.WATSONX_URL,
            project_id=settings.WATSONX_PROJECT_ID,
        )
    except Exception as e:
        logger.warning("llm.watsonx_failed", error=str(e))
        return None


class LLMFactory:
    """Build one ordered chain; explicit request pins can also pin fallbacks."""
    def __init__(self, cfg: OrchestraConfig):
        self.cfg = cfg

    def build_models(self, temperature=None, max_tokens=None, *, model=None,
                     fallback_model=None, provider=None, reasoning_effort=None, include_fallbacks=True) -> list:
        from app.config import settings
        from app.core.llm_provider import get_async_openai_clients, resolve_provider_order
        try:
            from agno.models.openai.like import OpenAILike
        except ImportError:
            logger.warning('llm.missing_agno')
            return []

        client_cache = {}
        def clients_for(name, requested):
            key = (name, requested)
            if key not in client_cache:
                client_cache[key] = get_async_openai_clients(override_model=requested, providers=[name])
            return client_cache[key]

        class ConfiguredClientModel(OpenAILike):
            def __deepcopy__(self, memo):
                cloned = super().__deepcopy__(memo)
                cloned.async_client = self.async_client
                return cloned

            async def aresponse_stream(self, *args, **kwargs):
                emitted = False
                try:
                    async for event in super().aresponse_stream(*args, **kwargs):
                        emitted = emitted or bool(getattr(event, 'content', None))
                        yield event
                except Exception as error:
                    if emitted:
                        raise RuntimeError('Model stream interrupted') from error
                    raise

        t = self.cfg.temperature if temperature is None else temperature
        tokens = self.cfg.max_tokens if max_tokens is None else max_tokens
        effort = self.cfg.reasoning_effort if reasoning_effort is None else reasoning_effort
        preferred = (provider or self.cfg.llm_provider).strip().lower()
        configured = [preferred, *self.cfg.llm_fallback_providers]
        order = resolve_provider_order(configured, configured)
        default = getattr(settings, f'{preferred.upper()}_MODEL', None)
        if model is None and preferred not in ('anthropic', 'watsonx'):
            defaults = clients_for(preferred, None)
            if defaults:
                default = defaults[0][2]
        override = model if model is not None else (self.cfg.llm_model if self.cfg.llm_model != default else None)
        # Keep explicit OpenRouter-style overrides usable even when it is not
        # the configured primary. Native endpoint/model IDs retain their route.
        routed = override and '/' in override and not override.startswith(('accounts/', 'ibm/'))
        modal_model = getattr(settings, 'MODAL_MODEL', None)
        if routed and provider is None and 'hierarchy' not in override.lower() and override != modal_model:
            primary_order = resolve_provider_order(['openrouter', *order], ['openrouter', *order])
        else:
            primary_order = order

        def candidate(name, requested):
            native = {'anthropic': _build_anthropic, 'watsonx': _build_watsonx}
            if name in native:
                selected = requested or getattr(settings, f'{name.upper()}_MODEL', None)
                if requested and name == 'anthropic':
                    selected = requested.removeprefix('anthropic/')
                    if not selected.startswith('claude'):
                        return None
                if requested and name == 'watsonx' and not (requested.startswith('ibm/') or requested == settings.WATSONX_MODEL):
                    return None
                return native[name](replace(self.cfg, llm_model=selected), t, tokens,
                                    model=selected, reasoning_effort=effort)
            clients = clients_for(name, requested)
            if not clients:
                return None
            _, client, selected = clients[0]
            if not isinstance(selected, str) or not selected.strip():
                logger.warning('llm.invalid_model', provider=name)
                return None
            options = dict(id=selected, provider=name, name=name, async_client=client,
                           api_key=client.api_key, base_url=str(client.base_url), temperature=t)
            key = 'max_completion_tokens' if name == 'openai' and _uses_max_completion_tokens(selected) else 'max_tokens'
            options[key] = tokens
            if name in ('openai', 'openrouter') and effort and _supports_reasoning_effort(selected):
                options['reasoning_effort'] = effort
            return ConfiguredClientModel(**options)

        models, primary_provider = [], None
        for name in primary_order:
            built = candidate(name, override)
            if built is not None:
                models.append(built)
                primary_provider = name
                break
        if not models or not include_fallbacks:
            return models
        for name in order:
            if name == primary_provider:
                continue
            built = candidate(name, fallback_model)
            if built is not None:
                models.append(built)
        return models

    def build(self, temperature=None, max_tokens=None, provider=None, model=None,
              reasoning_effort=None) -> Optional[Any]:
        """Primary-only convenience for memory and existing rendering consumers."""
        models = self.build_models(temperature, max_tokens, provider=provider,
                                   model=model, reasoning_effort=reasoning_effort, include_fallbacks=False)
        return models[0] if models else None

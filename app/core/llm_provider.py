from typing import List, Tuple, Optional
from openai import AsyncOpenAI
import logging

from app.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

def get_async_openai_clients(
    override_model: Optional[str] = None,
    **client_kwargs
) -> List[Tuple[str, AsyncOpenAI, str]]:
    """
    Returns a priority-ordered list of (provider_name, AsyncOpenAI, model_name).
    
    Reads from settings.LLM_PROVIDER_PRIORITY (comma-separated list, e.g., "openai,openrouter").
    If empty, defaults to trying "openai" then "openrouter".
    
    Args:
        override_model: If provided, this model string is used instead of the default settings model.
        **client_kwargs: Additional arguments passed directly to the AsyncOpenAI constructor 
                         (e.g., base_url, max_retries, timeout, etc. Note: base_url and api_key 
                         are populated automatically if not overridden).
    """
    priority_str = getattr(settings, "LLM_PROVIDER_PRIORITY", "") or "modal,openai,openrouter,together,anyscale"
    order = [p.strip().lower() for p in priority_str.split(",") if p.strip()]
    
    out: List[Tuple[str, AsyncOpenAI, str]] = []
    
    for provider in order:
        if provider == "openai":
            api_key = client_kwargs.get("api_key") or getattr(settings, "OPENAI_API_KEY", None)
            if api_key:
                model = override_model or getattr(settings, "OPENAI_MODEL", "gpt-4o-mini")
                kwargs = client_kwargs.copy()
                kwargs["api_key"] = api_key
                try:
                    out.append(("openai", AsyncOpenAI(**kwargs), model))
                except Exception as e:
                    logger.warning(f"Failed to initialize unified OpenAI client: {e}")
            else:
                logger.debug("Skipping OpenAI fallback: OPENAI_API_KEY not set")
                
        elif provider == "openrouter":
            api_key = client_kwargs.get("api_key") or getattr(settings, "OPENROUTER_API_KEY", None)
            if api_key:
                model = override_model or getattr(settings, "OPENROUTER_MODEL", "openai/gpt-4o-mini")
                # Fix openrouter model name prefix if necessary
                if not model.startswith("openai/") and "/" not in model and ":" not in model:
                    model = f"openai/{model}"
                
                kwargs = client_kwargs.copy()
                kwargs["api_key"] = api_key
                kwargs.setdefault("base_url", OPENROUTER_BASE_URL)
                try:
                    out.append(("openrouter", AsyncOpenAI(**kwargs), model))
                except Exception as e:
                    logger.warning(f"Failed to initialize unified OpenRouter client: {e}")
            else:
                logger.debug("Skipping OpenRouter fallback: OPENROUTER_API_KEY not set")
                
        elif provider == "anyscale":
            api_key = client_kwargs.get("api_key") or getattr(settings, "ANYSCALE_API_KEY", None)
            if api_key:
                model = override_model or getattr(settings, "ANYSCALE_MODEL", "meta-llama/Meta-Llama-3-70B-Instruct")
                
                kwargs = client_kwargs.copy()
                kwargs["api_key"] = api_key
                kwargs.setdefault("base_url", "https://api.endpoints.anyscale.com/v1")
                try:
                    out.append(("anyscale", AsyncOpenAI(**kwargs), model))
                except Exception as e:
                    logger.warning(f"Failed to initialize unified Anyscale client: {e}")
            else:
                logger.debug("Skipping Anyscale fallback: ANYSCALE_API_KEY not set")
                
        elif provider == "together":
            api_key = client_kwargs.get("api_key") or getattr(settings, "TOGETHER_API_KEY", None)
            if api_key:
                model = override_model or getattr(settings, "TOGETHER_MODEL", "meta-llama/Meta-Llama-3-70B-Instruct-Turbo")
                
                kwargs = client_kwargs.copy()
                kwargs["api_key"] = api_key
                kwargs.setdefault("base_url", "https://api.together.xyz/v1")
                try:
                    out.append(("together", AsyncOpenAI(**kwargs), model))
                except Exception as e:
                    logger.warning(f"Failed to initialize unified Together client: {e}")
            else:
                logger.debug("Skipping Together fallback: TOGETHER_API_KEY not set")
                
        elif provider == "fireworks":
            api_key = client_kwargs.get("api_key") or getattr(settings, "FIREWORKS_API_KEY", None)
            if api_key:
                model = override_model or getattr(settings, "FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p1-70b-instruct")
                
                kwargs = client_kwargs.copy()
                kwargs["api_key"] = api_key
                kwargs.setdefault("base_url", "https://api.fireworks.ai/inference/v1")
                try:
                    out.append(("fireworks", AsyncOpenAI(**kwargs), model))
                except Exception as e:
                    logger.warning(f"Failed to initialize unified Fireworks client: {e}")
            else:
                logger.debug("Skipping Fireworks fallback: FIREWORKS_API_KEY not set")
                
        elif provider == "modal":
            # For a custom modal deployment serving an OpenAI-compatible API
            api_key = client_kwargs.get("api_key") or getattr(settings, "MODAL_API_KEY", "dummy-key-for-modal")
            base_url = client_kwargs.get("base_url") or getattr(settings, "MODAL_BASE_URL", None)
            
            if base_url:
                model = override_model or getattr(settings, "MODAL_MODEL", "akhilles3/llama-3-8b-hierarchy-extractor")
                
                kwargs = client_kwargs.copy()
                kwargs["api_key"] = api_key
                kwargs["base_url"] = base_url
                try:
                    out.append(("modal", AsyncOpenAI(**kwargs), model))
                except Exception as e:
                    logger.warning(f"Failed to initialize Modal client: {e}")
            else:
                logger.debug("Skipping Modal fallback: MODAL_BASE_URL not set")
                
    return out

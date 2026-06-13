"""
LLMModels — builds Agno model objects from app settings.
"""

from __future__ import annotations
from typing import Any, Optional
import structlog

logger = structlog.get_logger()


class LLMModels:

    @staticmethod
    def build_openai(model_id: str, temperature: float, max_tokens: int) -> Optional[Any]:
        from app.config import settings
        if not settings.OPENAI_API_KEY:
            logger.warning("models.openai_key_missing")
            return None
        try:
            from agno.models.openai import OpenAIChat
            return OpenAIChat(
                id=model_id or "gpt-4o-mini",
                api_key=settings.OPENAI_API_KEY,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except ImportError as e:
            logger.warning("models.import_error", provider="openai", error=str(e))
            return None

    @staticmethod
    def build_anthropic(model_id: str, max_tokens: int) -> Optional[Any]:
        try:
            from agno.models.anthropic import Claude
            return Claude(id=model_id or "claude-3-haiku-20240307", max_tokens=max_tokens)
        except ImportError as e:
            logger.warning("models.import_error", provider="anthropic", error=str(e))
            return None

    @staticmethod
    def build_watsonx(model_id: str) -> Optional[Any]:
        from app.config import settings
        api_key    = settings.WATSONX_API_KEY
        url        = settings.WATSONX_URL
        project_id = settings.WATSONX_PROJECT_ID
        if not (api_key and url and project_id):
            logger.debug("models.watsonx_creds_missing")
            return None
        try:
            from agno.models.ibm import WatsonX
            return WatsonX(
                id=model_id or "ibm/granite-13b-chat-v2",
                api_key=api_key,
                url=url,
                project_id=project_id,
            )
        except ImportError as e:
            logger.warning("models.import_error", provider="watsonx", error=str(e))
            return None

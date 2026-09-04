"""Request-scoped AI attribution. Handlers set it; llm_service/embeddings read it.

Set in customer.py (chat), ingestion tasks (kb_id), evaluations runner.
Never raises — missing context just means NULL attribution columns.
"""
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional
from uuid import UUID


@dataclass
class AiUsageContext:
    space_id: Optional[UUID] = None
    chatbot_id: Optional[UUID] = None
    kb_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    message_id: Optional[UUID] = None


_current: ContextVar[Optional[AiUsageContext]] = ContextVar("ai_usage_ctx", default=None)


def set_ai_usage_context(ctx: AiUsageContext) -> object:
    """Set the context; returns the token to pass to reset_ai_usage_context()."""
    return _current.set(ctx)


def reset_ai_usage_context(token: object) -> None:
    _current.reset(token)


def get_ai_usage_context() -> AiUsageContext:
    return _current.get() or AiUsageContext()

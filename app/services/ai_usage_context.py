"""Request-scoped AI attribution. Handlers set it; llm_service/embeddings read it.

Set in customer.py (chat), ingestion tasks (kb_id), evaluations runner.
Never raises — missing context just means NULL attribution columns.
"""
from contextvars import ContextVar
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from decimal import Decimal
from threading import Lock
from typing import Optional
from uuid import UUID


@dataclass
class AiUsageCost:
    """Synchronous totals shared with parser/embedding worker threads."""

    known_usd: Decimal = Decimal(0)
    priced_calls: int = 0
    unpriced_calls: int = 0
    _lock: Lock = field(default_factory=Lock, repr=False)

    def add(self, cost: Optional[Decimal]) -> None:
        with self._lock:
            if cost is None:
                self.unpriced_calls += 1
            else:
                self.known_usd += cost
                self.priced_calls += 1

    def snapshot(self) -> dict:
        with self._lock:
            return {"known_usd": float(self.known_usd),
                    "priced_calls": self.priced_calls,
                    "unpriced_calls": self.unpriced_calls}

    @property
    def total(self) -> Optional[float]:
        with self._lock:
            return None if self.unpriced_calls else float(self.known_usd)


@dataclass
class AiUsageContext:
    space_id: Optional[UUID] = None
    chatbot_id: Optional[UUID] = None
    kb_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    message_id: Optional[UUID] = None
    
    # Aura Attribution
    product: Optional[str] = None
    runtime_kind: Optional[str] = None
    aura_id: Optional[UUID] = None
    aura_version_id: Optional[UUID] = None
    aura_run_id: Optional[UUID] = None
    cost: Optional[AiUsageCost] = None


_current: ContextVar[Optional[AiUsageContext]] = ContextVar("ai_usage_ctx", default=None)


def set_ai_usage_context(ctx: AiUsageContext) -> object:
    """Set the context; returns the token to pass to reset_ai_usage_context()."""
    return _current.set(ctx)


def reset_ai_usage_context(token: object) -> None:
    _current.reset(token)


def get_ai_usage_context() -> AiUsageContext:
    return _current.get() or AiUsageContext()


@contextmanager
def ai_usage_scope(*, independent=False, **attributes):
    """Jobs start fresh; nested pipeline calls retain job-wide attribution."""
    previous = AiUsageContext() if independent else get_ai_usage_context()
    ctx = replace(previous, **attributes)
    if ctx.cost is None:
        ctx.cost = AiUsageCost()
    token = set_ai_usage_context(ctx)
    try:
        yield ctx.cost
    finally:
        reset_ai_usage_context(token)

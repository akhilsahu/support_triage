"""Redis-backed spend and concurrency guards for Deep Preview."""

from __future__ import annotations

from datetime import datetime, timezone
import secrets
import threading
from typing import Any

import structlog

from app.config import settings
from app.core.redis import redis_client
from app.orchestra.ai.ingestion.scraper.base import ScrapeError

logger = structlog.get_logger()

_DAILY_TTL_SECONDS = 48 * 60 * 60
_ACTIVE_TTL_SECONDS = 30
_RELEASE_IF_OWNER = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
"""


class DeepPreviewLimitError(ScrapeError):
    """A Deep Preview rejected before any provider request is made."""


class _ProcessCapacity:
    """Small process-local fail-fast capacity guard."""

    def __init__(self) -> None:
        self._active = 0
        self._lock = threading.Lock()

    def try_acquire(self) -> bool:
        limit = max(1, settings.FIRECRAWL_MAX_CONCURRENT_REQUESTS)
        with self._lock:
            if self._active >= limit:
                return False
            self._active += 1
            return True

    def release(self) -> None:
        with self._lock:
            self._active = max(0, self._active - 1)


_process_capacity = _ProcessCapacity()


class DeepPreviewLease:
    """Charge the daily quota and hold one in-flight lease per caller.

    The current authentication model has one principal per space, so the API
    passes the space id for both ``space_id`` and ``user_id``. Keeping these
    identifiers separate here preserves the intended contract for a future
    staff/user principal without coupling this module to authentication.
    """

    def __init__(self, *, space_id: str, user_id: str):
        self._daily_key = (
            f"deep-preview:daily:{datetime.now(timezone.utc).date().isoformat()}:{space_id}"
        )
        self._active_key = f"deep-preview:active:{user_id}"
        self._owner = secrets.token_urlsafe(24)
        self._acquired = False
        self._process_acquired = False

    async def _refund(self) -> None:
        await redis_client.increment(self._daily_key, -1)

    async def __aenter__(self) -> "DeepPreviewLease":
        if not _process_capacity.try_acquire():
            raise DeepPreviewLimitError(
                "Deep Preview capacity is busy. Try again shortly.",
                reason="deep_busy",
                status_hint=429,
            )
        self._process_acquired = True

        try:
            return await self._acquire_distributed()
        except BaseException:
            self._release_process()
            raise

    async def _acquire_distributed(self) -> "DeepPreviewLease":
        count = await redis_client.increment(self._daily_key)
        if count is None:
            raise DeepPreviewLimitError(
                "Deep Preview is temporarily unavailable.",
                reason="deep_busy",
                status_hint=503,
            )

        if count == 1 and not await redis_client.expire(self._daily_key, _DAILY_TTL_SECONDS):
            await self._refund()
            raise DeepPreviewLimitError(
                "Deep Preview is temporarily unavailable.",
                reason="deep_busy",
                status_hint=503,
            )

        if count > settings.FIRECRAWL_MAX_REQUESTS_PER_SPACE_PER_DAY:
            await self._refund()
            raise DeepPreviewLimitError(
                "Deep Preview daily limit reached. Try again tomorrow.",
                reason="deep_quota_exceeded",
                status_hint=429,
            )

        raw: Any = redis_client.redis
        if raw is None:
            await self._refund()
            raise DeepPreviewLimitError(
                "Deep Preview is temporarily unavailable.",
                reason="deep_busy",
                status_hint=503,
            )
        try:
            acquired = await raw.set(
                self._active_key, self._owner, nx=True, ex=_ACTIVE_TTL_SECONDS
            )
        except Exception as exc:
            logger.warning("scraper.deep.limit_unavailable", error=type(exc).__name__)
            await self._refund()
            raise DeepPreviewLimitError(
                "Deep Preview is temporarily unavailable.",
                reason="deep_busy",
                status_hint=503,
            ) from exc

        if not acquired:
            await self._refund()
            raise DeepPreviewLimitError(
                "A Deep Preview is already running. Try again shortly.",
                reason="deep_busy",
                status_hint=429,
            )

        self._acquired = True
        return self

    def _release_process(self) -> None:
        if self._process_acquired:
            _process_capacity.release()
            self._process_acquired = False

    async def __aexit__(self, exc_type, exc, tb) -> None:
        try:
            if self._acquired and redis_client.redis is not None:
                try:
                    await redis_client.redis.eval(
                        _RELEASE_IF_OWNER, 1, self._active_key, self._owner
                    )
                except Exception as release_error:
                    logger.warning(
                        "scraper.deep.lease_release_failed",
                        error=type(release_error).__name__,
                    )
        finally:
            self._acquired = False
            self._release_process()

"""
Lightweight fixed-window rate limiting backed by Redis.

Used to throttle abuse-prone endpoints (e.g. login). Designed to FAIL OPEN:
if Redis is unavailable we log a warning and allow the request rather than
locking every user out because of an infrastructure blip.
"""

from __future__ import annotations

import structlog
from fastapi import HTTPException, Request

from app.core.redis import redis_client

logger = structlog.get_logger()


def client_ip(request: Request) -> str:
    """
    Resolve the real client IP.

    X-Forwarded-For is attacker-controlled when the direct connection comes from
    a non-trusted host. We only trust it when the direct TCP connection is from
    a known reverse-proxy (localhost or a private subnet). In that case, the
    right-most entry is the one the trusted proxy appended — not the left-most,
    which the client can forge.
    """
    direct_ip = request.client.host if request.client else "unknown"
    # Treat loopback and RFC-1918 ranges as trusted proxy addresses.
    _trusted = ("127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
                 "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
                 "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
                 "192.168.", "::1", "fd", "fc")
    behind_proxy = any(direct_ip.startswith(p) for p in _trusted)
    if behind_proxy:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            # Right-most entry = added by our proxy; left entries may be forged.
            return xff.split(",")[-1].strip()
    return direct_ip


async def enforce_rate_limit(bucket: str, identifier: str, limit: int, window_sec: int) -> None:
    """
    Increment a fixed-window counter for (bucket, identifier).
    Raises HTTP 429 once the count exceeds `limit` within `window_sec`.

    Fails open: any Redis error allows the request through.
    """
    key = f"rl:{bucket}:{identifier}"
    try:
        count = await redis_client.increment(key)
        if count is None:
            return  # Redis error already logged in increment() — fail open
        if count == 1:
            await redis_client.expire(key, window_sec)
        if count > limit:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please wait a moment and try again.",
                headers={"Retry-After": str(window_sec)},
            )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — never let limiter break the endpoint
        logger.warning("rate_limit.failed_open", bucket=bucket, error=str(e))


async def reset_rate_limit(bucket: str, identifier: str) -> None:
    """Clear a counter (e.g. after a successful login) so legit users aren't penalized."""
    try:
        await redis_client.delete(f"rl:{bucket}:{identifier}")
    except Exception as e:  # noqa: BLE001
        logger.warning("rate_limit.reset_failed", bucket=bucket, error=str(e))

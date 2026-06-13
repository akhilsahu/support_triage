"""
Service hours utility.

Handles overnight shifts (e.g. 22:00–06:00) where start_time > end_time.
Standard start <= now <= end fails for midnight-crossing ranges.
"""

from datetime import datetime, time
from zoneinfo import ZoneInfo


def is_within_service_hours(
    start: str | None,
    end: str | None,
    tz: str = "UTC",
) -> bool:
    """
    Check if the current time falls within the configured service window.

    Args:
        start: "HH:MM" string or None (None = always available)
        end:   "HH:MM" string or None
        tz:    ZoneInfo timezone key e.g. "Asia/Shanghai", "UTC"

    Returns:
        True if within hours (or if start/end not configured).
    """
    if not start or not end:
        return True  # no hours configured = always available

    try:
        now = datetime.now(ZoneInfo(tz)).time()
        start_t = time.fromisoformat(start)
        end_t   = time.fromisoformat(end)

        if start_t <= end_t:
            # Normal range: 09:00–18:00
            return start_t <= now <= end_t
        else:
            # Overnight range: 22:00–06:00
            return now >= start_t or now <= end_t

    except Exception:
        return True  # on any parse error, don't block transfers

"""
SSE connection registry and broadcast helpers.

Maintains two in-memory registries:
  _customer_connections  session_id  → asyncio.Queue
  _staff_connections     staff_id    → asyncio.Queue

When the server wants to push an event, it puts a message into the
relevant queue. The SSE endpoint drains the queue and streams to the client.

Staff connections also track which space they belong to so we can
fan-out queue_updated events to every connected staff in a space.
"""

import asyncio
import json
import structlog
from uuid import UUID

logger = structlog.get_logger()

# session_id (str) → asyncio.Queue
_customer_connections: dict[str, asyncio.Queue] = {}

# staff_id (str) → {"queue": asyncio.Queue, "space_id": str}
_staff_connections: dict[str, dict] = {}


# ── Registration ──────────────────────────────────────────────────────────────

def register_customer(session_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _customer_connections[session_id] = q
    logger.info("sse.customer_connected", session_id=session_id)
    return q


def unregister_customer(session_id: str) -> None:
    _customer_connections.pop(session_id, None)
    logger.info("sse.customer_disconnected", session_id=session_id)


def register_staff(staff_id: str, space_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _staff_connections[staff_id] = {"queue": q, "space_id": space_id}
    logger.info("sse.staff_connected", staff_id=staff_id, space_id=space_id)
    return q


def unregister_staff(staff_id: str) -> None:
    _staff_connections.pop(staff_id, None)
    logger.info("sse.staff_disconnected", staff_id=staff_id)


# ── Push helpers ──────────────────────────────────────────────────────────────

def _make_event(event: str, data: dict) -> dict:
    return {"event": event, "data": json.dumps(data)}


async def push_to_customer(session_id: str, event: str, data: dict) -> None:
    """Push one event to a specific customer session."""
    q = _customer_connections.get(str(session_id))
    if q:
        await q.put(_make_event(event, data))


async def push_to_staff(staff_id: str, event: str, data: dict) -> None:
    """Push one event to a specific staff member."""
    entry = _staff_connections.get(str(staff_id))
    if entry:
        await entry["queue"].put(_make_event(event, data))


async def broadcast_to_space_staff(space_id: str, event: str, data: dict) -> None:
    """Push one event to every connected staff member in a space."""
    sid = str(space_id)
    for staff_id, entry in list(_staff_connections.items()):
        if entry.get("space_id") == sid:
            await entry["queue"].put(_make_event(event, data))


# ── Convenience event senders ─────────────────────────────────────────────────

async def send_staff_assigned(
    session_id: str,
    space_id: str,
    staff_id: str,
    staff_name: str,
    customer_info: dict,
    history: list,
) -> None:
    """Notify customer that staff joined + notify the assigned staff of new session."""
    await push_to_customer(session_id, "staff_assigned", {
        "staff_name": staff_name,
        "staff_id":   staff_id,
        "message":    f"{staff_name} has joined the chat.",
    })
    await push_to_staff(staff_id, "new_session", {
        "session_id":    session_id,
        "customer_info": customer_info,
        "history":       history,
    })
    await broadcast_to_space_staff(space_id, "queue_updated", {
        "action": "assigned",
        "session_id": session_id,
    })


async def send_session_transferred(
    session_id: str,
    space_id: str,
    from_staff_id: str,
    from_staff_name: str,
    to_staff_id: str,
    to_staff_name: str,
) -> None:
    payload = {
        "session_id":      session_id,
        "from_staff_id":   from_staff_id,
        "from_staff_name": from_staff_name,
        "to_staff_id":     to_staff_id,
        "to_staff_name":   to_staff_name,
    }
    await push_to_customer(session_id, "session_transferred", {
        "message": f"Your chat has been transferred to {to_staff_name}."
    })
    await push_to_staff(from_staff_id, "session_transferred", payload)
    await push_to_staff(to_staff_id,   "session_transferred", payload)
    await broadcast_to_space_staff(space_id, "queue_updated", {
        "action": "transferred", "session_id": session_id
    })


async def send_queue_position(session_id: str, position: int) -> None:
    await push_to_customer(session_id, "queue_position_update", {
        "position": position,
        "message":  f"You are #{position} in the queue.",
    })


async def send_queue_expired(session_id: str, message: str) -> None:
    await push_to_customer(session_id, "queue_expired", {"message": message})


async def send_human_message(
    session_id: str,
    content: str,
    staff_name: str,
    timestamp: str,
) -> None:
    await push_to_customer(session_id, "human_message", {
        "content":    content,
        "staff_name": staff_name,
        "timestamp":  timestamp,
    })

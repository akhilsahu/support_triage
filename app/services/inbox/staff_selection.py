"""
Staff candidate filtering and selection algorithms.

Three selection strategies (tried in order):
  1. History priority  — last staff who served this customer
  2. LLM assignment    — AI picks the best match from candidates
  3. Load balancing    — staff with fewest active chats

All strategies receive a pre-filtered list of available candidates
from _get_available_candidates().
"""

from __future__ import annotations

import structlog
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.staff import StaffMember
from app.models.inbox import SessionAssignmentHistory
from app.services.inbox.service_hours import is_within_service_hours

logger = structlog.get_logger()


# ── Candidate filtering ───────────────────────────────────────────────────────

async def get_available_candidates(
    db: AsyncSession,
    space_id: UUID,
    exclude_staff_id: UUID | None = None,
) -> list[StaffMember]:
    """
    Return staff members who can accept a new chat right now.

    Filters:
    - active = True
    - presence = online
    - service_paused = False
    - active_chat_count < max_concurrent_chats
    - within service hours (timezone-aware, overnight-safe)
    - optionally exclude a specific staff member (e.g. the one transferring)
    """
    result = await db.execute(
        select(StaffMember).where(
            StaffMember.space_id == space_id,
            StaffMember.active == True,
            StaffMember.presence == "online",
            StaffMember.service_paused == False,
            StaffMember.active_chat_count < StaffMember.max_concurrent_chats,
        )
    )
    candidates = list(result.scalars().all())

    if exclude_staff_id:
        candidates = [c for c in candidates if c.id != exclude_staff_id]

    # Filter by service hours (done in Python — timezone logic is complex)
    candidates = [
        c for c in candidates
        if is_within_service_hours(c.service_hours_start, c.service_hours_end, c.timezone)
    ]

    return candidates


# ── History priority ──────────────────────────────────────────────────────────

async def get_last_serving_staff(
    db: AsyncSession,
    customer_session_ids: list[UUID],
    candidates: list[StaffMember],
) -> StaffMember | None:
    """
    Find the last staff member who served this customer in any prior session.
    Returns them only if they are currently in the candidates list.
    """
    if not customer_session_ids or not candidates:
        return None

    candidate_ids = [c.id for c in candidates]

    result = await db.execute(
        select(SessionAssignmentHistory)
        .where(
            SessionAssignmentHistory.session_id.in_(customer_session_ids),
            SessionAssignmentHistory.staff_id.in_(candidate_ids),
        )
        .order_by(SessionAssignmentHistory.assigned_at.desc())
        .limit(1)
    )
    history = result.scalar_one_or_none()
    if not history:
        return None

    return next((c for c in candidates if c.id == history.staff_id), None)


# ── LLM assignment ────────────────────────────────────────────────────────────

async def llm_assign_staff(
    candidates: list[StaffMember],
    last_customer_message: str,
    session_summary: str = "",
) -> StaffMember | None:
    """
    Use the LLM to select the best staff member for this conversation.
    Falls back to None (caller uses load balancing) if LLM fails or returns invalid ID.
    """
    from app.services.llm_service import llm_service

    candidate_lines = "\n".join([
        f"ID: {s.id} | Name: {s.name} | "
        f"Description: {s.description or 'General support'} | "
        f"Active chats: {s.active_chat_count}"
        for s in candidates
    ])

    prompt = (
        f"A customer needs to be transferred to a human support agent.\n\n"
        f"Customer's last message: \"{last_customer_message}\"\n"
        f"Conversation summary: {session_summary or 'No summary available.'}\n\n"
        f"Available staff members:\n{candidate_lines}\n\n"
        f"Reply with ONLY the UUID of the best staff member. Nothing else."
    )

    try:
        result = await llm_service.generate_with_fallback(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="You are a routing assistant. Reply with only a UUID.",
            temperature=0.1,
            max_tokens=50,
        )
        staff_id_str = (result.get("content") or "").strip()
        match = next((c for c in candidates if str(c.id) == staff_id_str), None)
        if not match:
            logger.warning("llm_assignment.invalid_id", returned=staff_id_str)
        return match
    except Exception as e:
        logger.warning("llm_assignment.failed", error=str(e))
        return None


# ── Load balancing ────────────────────────────────────────────────────────────

def load_balance(candidates: list[StaffMember]) -> StaffMember | None:
    """
    Select staff with fewest active chats.
    Online staff are prioritised over others (though candidates should all be online).
    """
    if not candidates:
        return None
    return sorted(candidates, key=lambda s: s.active_chat_count)[0]


# ── Main selection entry point ────────────────────────────────────────────────

async def select_staff(
    db: AsyncSession,
    candidates: list[StaffMember],
    history_priority_enabled: bool,
    llm_assignment_enabled: bool,
    customer_session_ids: list[UUID],
    last_customer_message: str,
    target_staff_id: UUID | None = None,
) -> StaffMember | None:
    """
    Run through the selection hierarchy and return the chosen staff member.

    Order:
      1. Direct (target_staff_id specified)
      2. History priority
      3. LLM assignment
      4. Load balancing
    """
    if not candidates:
        return None

    # 1. Direct assignment
    if target_staff_id:
        direct = next((c for c in candidates if c.id == target_staff_id), None)
        if direct:
            return direct
        logger.warning("staff_selection.direct_target_unavailable", target=str(target_staff_id))

    # 2. History priority
    if history_priority_enabled and customer_session_ids:
        last = await get_last_serving_staff(db, customer_session_ids, candidates)
        if last:
            logger.info("staff_selection.history_priority", staff_id=str(last.id))
            return last

    # 3. LLM assignment
    if llm_assignment_enabled and len(candidates) > 1:
        llm_pick = await llm_assign_staff(candidates, last_customer_message)
        if llm_pick:
            logger.info("staff_selection.llm_pick", staff_id=str(llm_pick.id))
            return llm_pick

    # 4. Load balance
    selected = load_balance(candidates)
    if selected:
        logger.info("staff_selection.load_balance", staff_id=str(selected.id))
    return selected

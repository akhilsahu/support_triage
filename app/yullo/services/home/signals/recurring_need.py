from typing import List
from datetime import datetime, timedelta
from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.signals.types import HomeSignalItem, Evidence, TypedAction

def evaluate(snapshot: HomeSnapshot, config: dict, now: datetime) -> List[HomeSignalItem]:
    candidates = []
    space_name_map = {s.id: s.name for s in snapshot.spaces}
    
    for window in snapshot.intent_windows:
        space_name = space_name_map.get(window.space_id, "Unknown")
        caps = snapshot.capabilities.get(window.space_id)
        
        # Actionable rule: only for repeated booking intent with no valid booking capability
        if window.intent == "booking" and window.last_7d_count >= 5:
            if not caps or not caps.has_booking_action:
                candidates.append(HomeSignalItem(
                    id=f"recurring-need-{window.space_id.hex}-{window.intent}",
                    kind="add_booking_action",
                    spaceId=window.space_id,
                    spaceName=space_name,
                    title=f"Booking comes up in {window.last_7d_count} conversations",
                    evidence=Evidence(
                        sourceLabel="Aura conversations",
                        observedAt=now,
                        windowStart=now - timedelta(days=7),
                        windowEnd=now,
                        sampleCount=window.last_7d_count,
                        distinctUnit="session",
                        ruleId="booking-recurrence",
                        collectionCoverageStart=None
                    ),
                    action=TypedAction(
                        kind="add_booking_action",
                        targetId=window.space_id
                    ),
                    ruleVersion="1",
                    evidenceFamily="intent",
                    priority=80 + min(window.last_7d_count, 20),
                    expiresAt=now + timedelta(days=7)
                ))
            
    return candidates

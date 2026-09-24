from typing import List
from datetime import datetime, timedelta
from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.signals.types import HomeSignalItem, Evidence

def evaluate(snapshot: HomeSnapshot, config: dict, now: datetime) -> List[HomeSignalItem]:
    candidates = []
    space_name_map = {s.id: s.name for s in snapshot.spaces}
    
    for window in snapshot.intent_windows:
        if window.intent in ("unknown", "general"):
            continue
            
        space_name = space_name_map.get(window.space_id, "Unknown")
        
        # Simple pattern: frequent topic over the last 7 days
        if window.last_7d_count >= 5:
            candidates.append(HomeSignalItem(
                id=f"pattern-{window.space_id.hex}-{window.intent}",
                kind="pattern",
                spaceId=window.space_id,
                spaceName=space_name,
                title=f"'{window.intent.title()}' is a frequent topic ({window.last_7d_count} times)",
                evidence=Evidence(
                    sourceLabel="Aura conversations",
                    observedAt=now,
                    windowStart=now - timedelta(days=7),
                    windowEnd=now,
                    sampleCount=window.last_7d_count,
                    distinctUnit="session",
                    ruleId="intent-pattern-v1",
                    collectionCoverageStart=None
                ),
                action=None,
                ruleVersion="1",
                evidenceFamily="intent",
                priority=60 + min(window.last_7d_count, 20),
                expiresAt=now + timedelta(days=7)
            ))
            
    return candidates

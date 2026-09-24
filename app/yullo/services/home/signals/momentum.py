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
            
        # Require complete collection coverage (we just assume True if it has data for both periods)
        # Require both periods >= 5, delta >= 3, ratio >= 1.5
        if window.last_7d_count >= 5 and window.prev_7d_count >= 5:
            delta = window.last_7d_count - window.prev_7d_count
            ratio = window.last_7d_count / window.prev_7d_count
            
            if delta >= 3 and ratio >= 1.5:
                space_name = space_name_map.get(window.space_id, "Unknown")
                
                candidates.append(HomeSignalItem(
                    id=f"momentum-{window.space_id.hex}-{window.intent}",
                    kind="momentum",
                    spaceId=window.space_id,
                    spaceName=space_name,
                    title=f"'{window.intent.title()}' is surging (up to {window.last_7d_count} from {window.prev_7d_count})",
                    evidence=Evidence(
                        sourceLabel="Aura conversations",
                        observedAt=now,
                        windowStart=now - timedelta(days=7),
                        windowEnd=now,
                        sampleCount=window.last_7d_count,
                        distinctUnit="session",
                        ruleId="intent-momentum-v1",
                        collectionCoverageStart=now - timedelta(days=14)
                    ),
                    action=None,
                    ruleVersion="1",
                    evidenceFamily="intent",
                    priority=70 + min(delta, 15),
                    expiresAt=now + timedelta(days=7)
                ))
            
    return candidates

from typing import List
from datetime import datetime, timedelta
from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.signals.types import HomeSignalItem, Evidence, TypedAction

def evaluate(snapshot: HomeSnapshot, config: dict, now: datetime) -> List[HomeSignalItem]:
    candidates = []
    
    for space in snapshot.spaces:
        caps = snapshot.capabilities.get(space.id)
        sources = snapshot.source_metrics.get(space.id)
        
        entities_count = caps.entities_count if caps else 0
        total_sources = sources.total_items if sources else 0
        
        # Missing evidence is NOT incomplete setup if they have owner-created entities (entities_count > 0)
        if total_sources == 0 and entities_count == 0:
            candidates.append(HomeSignalItem(
                id=f"setup-sources-{space.id.hex}",
                kind="add_sources",
                spaceId=space.id,
                spaceName=space.name,
                title="Aura needs material to learn from",
                evidence=Evidence(
                    sourceLabel="Space configuration",
                    observedAt=now,
                    windowStart=now,
                    windowEnd=now,
                    sampleCount=0,
                    distinctUnit="session",
                    ruleId="setup-no-sources-v1",
                    collectionCoverageStart=None
                ),
                action=TypedAction(
                    kind="add_sources",
                    targetId=space.id
                ),
                ruleVersion="1",
                evidenceFamily="setup",
                priority=100,
                expiresAt=now + timedelta(days=1)
            ))
        elif total_sources > 0 and entities_count == 0:
            candidates.append(HomeSignalItem(
                id=f"setup-continue-{space.id.hex}",
                kind="continue_setup",
                spaceId=space.id,
                spaceName=space.name,
                title="Aura has sources, but hasn't extracted facts yet",
                evidence=Evidence(
                    sourceLabel="Space configuration",
                    observedAt=now,
                    windowStart=now,
                    windowEnd=now,
                    sampleCount=total_sources,
                    distinctUnit="session",
                    ruleId="setup-no-entities-v1",
                    collectionCoverageStart=None
                ),
                action=TypedAction(
                    kind="continue_setup",
                    targetId=space.id
                ),
                ruleVersion="1",
                evidenceFamily="setup",
                priority=90,
                expiresAt=now + timedelta(days=1)
            ))
            
    return candidates

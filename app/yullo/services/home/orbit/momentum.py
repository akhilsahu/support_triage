from typing import List, Literal
from datetime import datetime
from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.orbit.base import OrbitProvider, OrbitCandidate
from app.yullo.services.home.signals import momentum

class MomentumProvider(OrbitProvider):
    kind: Literal["momentum"] = "momentum"

    def collect(self, snapshot: HomeSnapshot, config: dict, now: datetime) -> List[OrbitCandidate]:
        # Call the existing signal evaluator
        signal_items = momentum.evaluate(snapshot, config, now)
        
        candidates = []
        for item in signal_items:
            # Re-map HomeSignalItem to OrbitCandidate
            candidates.append(OrbitCandidate(
                id=f"orbit-{item.id}", # Prefix to distinguish, though ruleId matching prevents dupes later
                kind="momentum",
                metric=str(item.evidence.sampleCount),
                spaceId=item.spaceId,
                spaceName=item.spaceName,
                title=item.title,
                evidence=item.evidence,
                action=item.action,
                priority=item.priority,
                expiresAt=item.expiresAt,
                role="unassigned"
            ))
            
        return candidates

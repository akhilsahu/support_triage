from typing import List, Literal
from datetime import datetime, timedelta
from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.orbit.base import OrbitProvider, OrbitCandidate
from app.yullo.services.home.signals.types import Evidence

class PulseProvider(OrbitProvider):
    kind: Literal["pulse"] = "pulse"

    def collect(self, snapshot: HomeSnapshot, config: dict, now: datetime) -> List[OrbitCandidate]:
        candidates = []
        space_name_map = {s.id: s.name for s in snapshot.spaces}
        
        for space_id, metrics in snapshot.session_metrics.items():
            if metrics.last_7d_count >= 5:
                space_name = space_name_map.get(space_id, "Unknown")
                candidates.append(OrbitCandidate(
                    id=f"pulse:{space_id.hex}:{now.strftime('%Y%m%d')}:v1",
                    kind="pulse",
                    metric=str(metrics.last_7d_count),
                    spaceId=space_id,
                    spaceName=space_name,
                    title=f"{metrics.last_7d_count} conversations this week",
                    evidence=Evidence(
                        sourceLabel="Aura conversations",
                        observedAt=now,
                        windowStart=now - timedelta(days=7),
                        windowEnd=now,
                        sampleCount=metrics.last_7d_count,
                        distinctUnit="session",
                        ruleId="pulse-v1",
                        collectionCoverageStart=None
                    ),
                    action=None,
                    priority=60 + min(metrics.last_7d_count, 30),
                    expiresAt=now + timedelta(days=1),
                    role="unassigned"
                ))
        return candidates

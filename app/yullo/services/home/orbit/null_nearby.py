from typing import List, Literal
from datetime import datetime
from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.orbit.base import OrbitProvider, OrbitCandidate

class NullNearbyProvider(OrbitProvider):
    kind: Literal["nearby"] = "nearby"

    def collect(self, snapshot: HomeSnapshot, config: dict, now: datetime) -> List[OrbitCandidate]:
        return []

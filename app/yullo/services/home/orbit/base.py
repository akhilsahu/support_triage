from typing import List, Protocol, Literal
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from uuid import UUID

from app.yullo.services.home.repository import HomeSnapshot
from app.yullo.services.home.signals.types import Evidence, TypedAction

class OrbitCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["pulse", "momentum", "nearby", "connection"]
    metric: str
    spaceId: UUID
    spaceName: str
    title: str
    evidence: Evidence
    action: TypedAction | None = None
    priority: int
    expiresAt: datetime
    role: Literal["dominant", "supporting", "unassigned"] = "unassigned"

class OrbitProvider(Protocol):
    kind: Literal["pulse", "momentum", "nearby", "connection"]
    def collect(self, snapshot: HomeSnapshot, config: dict, now: datetime) -> List[OrbitCandidate]: ...

from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from uuid import UUID

class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sourceLabel: Optional[str] = None
    observedAt: Optional[datetime] = None
    windowStart: datetime
    windowEnd: datetime
    sampleCount: int
    distinctUnit: Literal["session"] = "session"
    ruleId: str
    collectionCoverageStart: Optional[datetime] = None

class TypedAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["add_service", "add_booking_action", "add_location", "continue_setup", "add_sources", "review_knowledge", "customize_appearance"]
    targetId: Optional[UUID] = None

class HomeSignalItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["continue_setup", "add_sources", "review_knowledge", "add_service", "add_booking_action", "add_location", "customize_appearance", "pattern", "momentum"]
    spaceId: UUID
    spaceName: str
    title: str
    evidence: Evidence
    action: Optional[TypedAction] = None
    ruleVersion: str
    evidenceFamily: str
    priority: int
    expiresAt: Optional[datetime] = None

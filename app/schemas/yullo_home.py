from datetime import datetime
from typing import List, Literal, Optional, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt


class YulloAccountInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    displayName: str = Field(alias="displayName")
    initials: str


class YulloPreferenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    appTheme: str = Field(alias="appTheme")


class YulloPreferenceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    appTheme: Literal["system", "light", "warm", "dark"] = Field(alias="appTheme")
    timezone: Optional[str] = None


HomeSectionId = Literal["pulse", "rightNow", "attention", "forYou", "spaces", "quickInsight", "orbit", "recent", "suggestion", "pattern"]

class HomeSectionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: HomeSectionId
    enabled: StrictBool
    order: StrictInt

class HomePreferencePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sections: Optional[List[HomeSectionPatch]] = None
    resetToDefaults: StrictBool = False


class YulloHomeSpace(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    logoUrl: Optional[str] = Field(None, alias="logoUrl")
    lifecycle: str
    auraStatus: Literal["draft", "learning", "updating", "live", "needs_review", "unavailable"] = Field(alias="auraStatus")
    conversationCountToday: int = Field(alias="conversationCountToday")
    newConversationCount: int = Field(alias="newConversationCount")
    attentionCount: int = Field(alias="attentionCount")
    lastActivityAt: Optional[datetime] = Field(None, alias="lastActivityAt")


class YulloHomeAttentionAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["review_knowledge", "retry_source", "add_action", "review_publication", "open_space"]
    label: str
    targetId: Optional[str] = Field(None, alias="targetId")


class YulloHomeAttention(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    spaceId: UUID = Field(alias="spaceId")
    spaceName: str = Field(alias="spaceName")
    kind: Literal["knowledge_conflict", "source_failed", "source_stale", "missing_action", "publication_blocked", "aura_unavailable"]
    title: str
    detail: Optional[str] = None
    action: YulloHomeAttentionAction
    occurredAt: datetime = Field(alias="occurredAt")


class YulloHomeActivity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    spaceId: UUID = Field(alias="spaceId")
    spaceName: str = Field(alias="spaceName")
    kind: Literal["conversation_started", "enquiry_received", "source_updated", "aura_published", "space_explored"]
    label: str
    occurredAt: datetime = Field(alias="occurredAt")
    isNew: bool = Field(alias="isNew")


class YulloHomeSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    spaceId: UUID = Field(alias="spaceId")
    spaceName: str = Field(alias="spaceName")
    kind: Literal["continue_setup", "add_sources", "review_knowledge", "add_service", "add_booking_action", "add_location", "customize_appearance"]
    reason: str
    actionLabel: str = Field(alias="actionLabel")


class YulloHomePattern(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    spaceId: UUID = Field(alias="spaceId")
    spaceName: str = Field(alias="spaceName")
    kind: Literal["pattern"]
    title: str
    actionLabel: str = Field(alias="actionLabel")


class YulloHomeOrbitCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["pulse", "momentum", "nearby", "connection"]
    metric: str
    spaceId: UUID = Field(alias="spaceId")
    spaceName: str = Field(alias="spaceName")
    title: str
    role: Literal["dominant", "supporting", "unassigned"]
    evidence: Optional[dict] = None
    actionKind: Optional[str] = Field(None, alias="actionKind")
    actionTargetId: Optional[str] = Field(None, alias="actionTargetId")


class YulloHomeOrbit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dominant: YulloHomeOrbitCandidate
    supporting: List[YulloHomeOrbitCandidate]


class YulloHomeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account: YulloAccountInfo
    preference: YulloPreferenceResponse
    spaces: List[YulloHomeSpace]
    rightNow: List[Any] = Field(default_factory=list, alias="rightNow")
    attention: List[YulloHomeAttention]
    recent: List[YulloHomeActivity]
    forYou: List[Any] = Field(default_factory=list, alias="forYou")
    quickInsight: Optional[Any] = Field(None, alias="quickInsight")
    orbit: Optional[YulloHomeOrbit] = None
    pattern: Optional[YulloHomePattern] = None
    suggestion: Optional[YulloHomeSuggestion] = None
    generatedAt: datetime = Field(alias="generatedAt")

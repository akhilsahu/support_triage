"""Typed contracts shared by production customer-chat execution paths.

These models carry identifiers and low-cardinality lifecycle metadata only.
Customer messages, reasoning text, authorization data, and tool payloads do not
belong in this contract because conversation events are retained for analytics.
"""

from __future__ import annotations

from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConversationChannel(str, Enum):
    """Supported origins for a conversation execution."""

    WEB = "web"
    WIDGET = "widget"
    API = "api"
    # Evaluation traffic is intentionally distinguishable from customer
    # traffic even though it reuses the same executor contract.
    EVALUATION = "evaluation"


class ConversationEventType(str, Enum):
    """Stable wire names for the first production lifecycle events."""

    MESSAGE_RECEIVED = "message.received"
    TRIAGE_COMPLETED = "triage.completed"
    AGENT_SELECTED = "agent.selected"
    RETRIEVAL_COMPLETED = "retrieval.completed"
    FACT_USED = "fact.used"
    TOOL_STARTED = "tool.started"
    TOOL_COMPLETED = "tool.completed"
    CLARIFICATION_REQUESTED = "clarification.requested"
    ANSWER_COMPLETED = "answer.completed"
    FEEDBACK_RECEIVED = "feedback.received"
    CSAT_SUBMITTED = "csat.submitted"
    ESCALATION_STARTED = "escalation.started"
    HUMAN_ASSIGNED = "human.assigned"
    CONVERSATION_RESOLVED = "conversation.resolved"
    CONVERSATION_REOPENED = "conversation.reopened"


class ConversationExecutionContext(BaseModel):
    """Immutable tenant and session context passed to an AI executor."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    space_id: UUID
    chatbot_id: UUID
    session_id: UUID
    conversation_id: str = ""
    customer_id: UUID | None = None
    channel: ConversationChannel = ConversationChannel.WEB
    locale: str | None = Field(default=None, max_length=35)

    @property
    def space_id_str(self) -> str:
        return str(self.space_id)

    @property
    def chatbot_id_str(self) -> str:
        return str(self.chatbot_id)

    @property
    def session_id_str(self) -> str:
        return str(self.session_id)


class ConversationEventData(BaseModel):
    """Redacted, low-cardinality metadata attached to a lifecycle event."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    agent: str | None = Field(default=None, max_length=120)
    intent: str | None = Field(default=None, max_length=120)
    rag_hit: bool | None = None
    response_ms: int | None = Field(default=None, ge=0)
    model: str | None = Field(default=None, max_length=160)
    reasoning_effort: str | None = Field(default=None, max_length=20)
    source_count: int | None = Field(default=None, ge=0)
    error_code: str | None = Field(default=None, max_length=80)
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def reject_sensitive_metadata_keys(
        cls,
        metadata: dict[str, str | int | float | bool | None],
    ) -> dict[str, str | int | float | bool | None]:
        """Block common credential fields before analytics data reaches storage."""

        sensitive_fragments = ("authorization", "cookie", "password", "secret", "token", "api_key")
        for key in metadata:
            normalized = key.casefold().replace("-", "_")
            if any(fragment in normalized for fragment in sensitive_fragments):
                raise ValueError(f"sensitive metadata key is not allowed: {key}")
        return metadata

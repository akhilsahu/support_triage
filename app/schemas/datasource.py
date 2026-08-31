"""Public request contracts for data-source connection and tool management."""

from typing import Any, ClassVar, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StrictPatchModel(ApiModel):
    """PATCH fields cannot be explicitly null unless listed as nullable."""

    _nullable_patch_fields: ClassVar[frozenset[str]] = frozenset({"secret"})

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        if isinstance(value, dict):
            invalid = sorted(key for key, child in value.items() if child is None and key not in cls._nullable_patch_fields)
            if invalid:
                raise ValueError(f"Fields cannot be null: {', '.join(invalid)}")
        return value


class ConnectionCreate(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    base_url: str = Field(min_length=1, max_length=1000)
    auth_type: str = Field(default="none", max_length=30)
    auth_header: str = Field(default="Authorization", max_length=100)
    secret: str | None = Field(default=None, max_length=10000)
    default_headers: dict[str, str] = Field(default_factory=dict)


class ConnectionUpdate(StrictPatchModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    base_url: str | None = Field(default=None, min_length=1, max_length=1000)
    auth_type: str | None = Field(default=None, max_length=30)
    auth_header: str | None = Field(default=None, max_length=100)
    secret: str | None = Field(default=None, max_length=10000)
    default_headers: dict[str, str] | None = None
    status: Literal["draft", "active", "disabled"] | None = None


class ToolCreate(ApiModel):
    connection_id: UUID
    name: str = Field(min_length=3, max_length=64)
    display_name: str = Field(default="", max_length=200)
    description: str = ""
    method: str = Field(default="GET", max_length=10)
    path: str = Field(default="", max_length=1000)
    risk_classification: str = Field(default="read", max_length=20)
    input_schema: dict[str, Any] = Field(default_factory=lambda: {"type": "object", "properties": {}})
    request_template: dict[str, Any] = Field(default_factory=dict)
    output_mapping: dict[str, str] = Field(default_factory=dict)
    record_path: str = Field(default="", max_length=500)
    max_records: int = Field(default=25, ge=1, le=100)
    max_response_bytes: int = Field(default=1_000_000, ge=1, le=10_000_000)


class ToolUpdate(StrictPatchModel):
    connection_id: UUID | None = None
    name: str | None = Field(default=None, min_length=3, max_length=64)
    display_name: str | None = Field(default=None, max_length=200)
    description: str | None = None
    method: str | None = Field(default=None, max_length=10)
    path: str | None = Field(default=None, max_length=1000)
    risk_classification: str | None = Field(default=None, max_length=20)
    input_schema: dict[str, Any] | None = None
    request_template: dict[str, Any] | None = None
    output_mapping: dict[str, str] | None = None
    record_path: str | None = Field(default=None, max_length=500)
    max_records: int | None = Field(default=None, ge=1, le=100)
    max_response_bytes: int | None = Field(default=None, ge=1, le=10_000_000)
    status: Literal["draft", "active", "disabled"] | None = None


class AgentAssignmentInput(ApiModel):
    agent_kind: Literal["builtin", "custom"]
    agent_id: UUID
    enabled: bool = True


class AssignmentReplace(ApiModel):
    chatbot_id: UUID
    assignments: list[AgentAssignmentInput] = Field(default_factory=list)


class ExecuteTestRequest(ApiModel):
    chatbot_id: UUID
    arguments: dict[str, Any] = Field(default_factory=dict)


class PublicResponse(BaseModel):
    """Permit ORM-derived dictionaries while preventing accidental extras."""

    model_config = ConfigDict(extra="ignore")

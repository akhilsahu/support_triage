"""Strict API and service contracts for chatbot evaluations."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EvaluationExpectation(BaseModel):
    """Deterministic conditions an execution result is expected to satisfy."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    expected_agent: str | None = Field(default=None, max_length=120)
    required_terms: list[str] = Field(default_factory=list, max_length=50)
    forbidden_terms: list[str] = Field(default_factory=list, max_length=50)
    expected_source_ids: list[str] = Field(default_factory=list, max_length=50)
    expected_rag_hit: bool | None = None
    expected_escalation: bool | None = None
    max_response_ms: int | None = Field(default=None, ge=1, le=300_000)

    @field_validator("required_terms", "forbidden_terms", "expected_source_ids")
    @classmethod
    def normalize_non_empty_values(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value for value in normalized):
            raise ValueError("list entries must not be blank")
        return normalized


class EvaluationActual(BaseModel):
    """Normalized, customer-visible output accepted by deterministic graders."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    response: str = Field(max_length=100_000)
    agent: str | None = Field(default=None, max_length=120)
    source_ids: list[str] = Field(default_factory=list, max_length=100)
    rag_hit: bool = False
    escalated: bool = False
    response_ms: int | None = Field(default=None, ge=0, le=300_000)


class EvaluationCheck(BaseModel):
    """Result of one named deterministic condition."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    status: Literal["passed", "failed", "skipped"]
    detail: str


class EvaluationGrade(BaseModel):
    """Aggregate deterministic grade for a single evaluation case."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    passed: bool
    checks: list[EvaluationCheck]
    failures: list[str]


class EvaluationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20_000)


class EvaluationSuiteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5_000)
    chatbot_id: UUID | None = None
    critical: bool = False


class EvaluationSuiteOut(BaseModel):
    id: UUID
    chatbot_id: UUID | None
    name: str
    description: str | None
    critical: bool
    created_at: datetime
    updated_at: datetime


class EvaluationCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    question: str = Field(min_length=1, max_length=20_000)
    history: list[EvaluationMessage] = Field(default_factory=list, max_length=50)
    customer_context: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    expectation: EvaluationExpectation = Field(default_factory=EvaluationExpectation)
    enabled: bool = True

    @field_validator("customer_context")
    @classmethod
    def reject_sensitive_context_keys(
        cls,
        context: dict[str, str | int | float | bool | None],
    ) -> dict[str, str | int | float | bool | None]:
        sensitive_fragments = ("authorization", "cookie", "password", "secret", "token", "api_key")
        for key in context:
            normalized = key.casefold().replace("-", "_")
            if any(fragment in normalized for fragment in sensitive_fragments):
                raise ValueError(f"sensitive customer-context key is not allowed: {key}")
        return context


class EvaluationCaseOut(BaseModel):
    id: UUID
    suite_id: UUID
    name: str
    question: str
    history: list[EvaluationMessage]
    customer_context: dict[str, str | int | float | bool | None]
    expectation: EvaluationExpectation
    enabled: bool
    created_at: datetime
    updated_at: datetime


class EvaluationGradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actual: EvaluationActual
    target: Literal["draft", "published"] = "published"


class EvaluationGradeResponse(BaseModel):
    run_id: UUID
    result_id: UUID
    grade: EvaluationGrade


class EvaluationRunOut(BaseModel):
    id: UUID
    suite_id: UUID
    target: Literal["draft", "published"]
    status: Literal["running", "completed", "failed"]
    total_cases: int
    passed_cases: int
    failed_cases: int
    started_at: datetime
    completed_at: datetime | None


class EvaluationRunRequest(BaseModel):
    """Request a real headless run against the currently published runtime."""

    model_config = ConfigDict(extra="forbid")

    # Draft is deliberately absent until configuration versioning exists.
    target: Literal["published"] = "published"


class EvaluationResultOut(BaseModel):
    id: UUID
    run_id: UUID
    case_id: UUID
    passed: bool
    checks: list[EvaluationCheck]
    failures: list[str]
    actual_response: str
    actual_agent: str | None
    actual_source_ids: list[str]
    actual_rag_hit: bool
    actual_escalated: bool
    response_ms: int | None
    created_at: datetime

import asyncio
import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.api.v1.evaluations import (
    _case_out,
    _get_case,
    _get_run,
    _get_suite,
    _result_out,
    _suite_out,
)
from app.models.evaluation import EvaluationCase, EvaluationResult, EvaluationSuite
from app.schemas.evaluation import EvaluationCaseCreate


class _Result:
    def __init__(self, value) -> None:
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _FakeDB:
    def __init__(self, value) -> None:
        self.value = value
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _Result(self.value)


def test_get_suite_query_always_includes_space_scope() -> None:
    expected = object()
    db = _FakeDB(expected)

    result = asyncio.run(_get_suite(db, uuid.uuid4(), uuid.uuid4()))

    assert result is expected
    assert len(db.statement._where_criteria) == 2


def test_get_case_query_includes_space_and_suite_scope() -> None:
    expected = object()
    db = _FakeDB(expected)

    result = asyncio.run(_get_case(db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4()))

    assert result is expected
    assert len(db.statement._where_criteria) == 3


def test_get_run_query_always_includes_space_scope() -> None:
    expected = object()
    db = _FakeDB(expected)

    result = asyncio.run(_get_run(db, uuid.uuid4(), uuid.uuid4()))

    assert result is expected
    assert len(db.statement._where_criteria) == 2


def test_output_helpers_validate_stored_expectations() -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    suite_id = uuid.uuid4()
    suite = EvaluationSuite(
        id=suite_id,
        space_id=uuid.uuid4(),
        name="Core",
        critical=True,
        created_at=now,
        updated_at=now,
    )
    case = EvaluationCase(
        id=uuid.uuid4(),
        suite_id=suite_id,
        space_id=suite.space_id,
        name="Reset",
        question="How do I reset?",
        history=[{"role": "user", "content": "I forgot my password"}],
        customer_context={"plan": "pro"},
        expectations={"required_terms": ["reset"]},
        enabled=True,
        created_at=now,
        updated_at=now,
    )

    assert _suite_out(suite).name == "Core"
    assert _case_out(case).expectation.required_terms == ["reset"]


def test_case_contract_rejects_credentials_in_customer_context() -> None:
    with pytest.raises(ValidationError):
        EvaluationCaseCreate(
            name="Unsafe",
            question="Test",
            customer_context={"api-key": "secret"},
        )


def test_result_output_exposes_normalized_data_without_reasoning() -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    result = EvaluationResult(
        id=uuid.uuid4(),
        run_id=uuid.uuid4(),
        case_id=uuid.uuid4(),
        space_id=uuid.uuid4(),
        passed=False,
        checks=[{"name": "required_terms", "status": "failed", "detail": "Missing."}],
        failures=["required_terms"],
        actual_response="No match",
        actual_agent="support",
        actual_source_ids=["doc-1"],
        actual_rag_hit=True,
        actual_escalated=False,
        response_ms=100,
        created_at=now,
    )

    output = _result_out(result)

    assert output.case_id == result.case_id
    assert output.checks[0].name == "required_terms"
    assert "reasoning" not in output.model_dump()

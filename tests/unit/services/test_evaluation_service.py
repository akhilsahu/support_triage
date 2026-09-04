import pytest
from pydantic import ValidationError

from app.schemas.evaluation import EvaluationActual, EvaluationExpectation
from app.services.evaluation_service import grade_evaluation


def test_grade_passes_when_all_expectations_match() -> None:
    expectation = EvaluationExpectation(
        expected_agent="support",
        required_terms=["reset link", "email"],
        forbidden_terms=["password is"],
        expected_source_ids=["doc-1"],
        expected_rag_hit=True,
        expected_escalation=False,
        max_response_ms=500,
    )
    actual = EvaluationActual(
        response="I sent a reset link to your email.",
        agent="support",
        source_ids=["doc-1", "doc-2"],
        rag_hit=True,
        escalated=False,
        response_ms=250,
    )

    grade = grade_evaluation(expectation, actual)

    assert grade.passed is True
    assert grade.failures == []
    assert all(check.status == "passed" for check in grade.checks)


@pytest.mark.parametrize(
    ("expectation", "actual", "failed_check"),
    [
        (
            EvaluationExpectation(expected_agent="billing"),
            EvaluationActual(response="ok", agent="support"),
            "expected_agent",
        ),
        (
            EvaluationExpectation(required_terms=["refund approved"]),
            EvaluationActual(response="Your request is pending."),
            "required_terms",
        ),
        (
            EvaluationExpectation(forbidden_terms=["guaranteed"]),
            EvaluationActual(response="Delivery is guaranteed tomorrow."),
            "forbidden_terms",
        ),
        (
            EvaluationExpectation(expected_source_ids=["policy-2"]),
            EvaluationActual(response="Policy applies.", source_ids=["policy-1"]),
            "expected_sources",
        ),
        (
            EvaluationExpectation(expected_rag_hit=True),
            EvaluationActual(response="No source.", rag_hit=False),
            "expected_rag_hit",
        ),
        (
            EvaluationExpectation(expected_escalation=True),
            EvaluationActual(response="I can help.", escalated=False),
            "expected_escalation",
        ),
        (
            EvaluationExpectation(max_response_ms=100),
            EvaluationActual(response="Slow response", response_ms=101),
            "max_response_ms",
        ),
    ],
)
def test_grade_reports_each_failed_expectation(
    expectation: EvaluationExpectation,
    actual: EvaluationActual,
    failed_check: str,
) -> None:
    grade = grade_evaluation(expectation, actual)

    assert grade.passed is False
    assert failed_check in grade.failures
    assert next(check for check in grade.checks if check.name == failed_check).status == "failed"


def test_grade_marks_unspecified_expectations_as_skipped() -> None:
    grade = grade_evaluation(
        EvaluationExpectation(),
        EvaluationActual(response="Anything is acceptable."),
    )

    assert grade.passed is True
    assert grade.failures == []
    assert all(check.status == "skipped" for check in grade.checks)


def test_matching_is_case_insensitive() -> None:
    grade = grade_evaluation(
        EvaluationExpectation(required_terms=["RESET LINK"], forbidden_terms=["Password IS"]),
        EvaluationActual(response="Your Reset Link has been emailed."),
    )

    assert grade.passed is True


def test_actual_contract_rejects_reasoning_payload() -> None:
    with pytest.raises(ValidationError):
        EvaluationActual(response="answer", reasoning="private reasoning")

"""Pure deterministic grading for normalized chatbot execution results."""

from __future__ import annotations

from app.schemas.evaluation import (
    EvaluationActual,
    EvaluationCheck,
    EvaluationExpectation,
    EvaluationGrade,
)


def _check(name: str, applicable: bool, passed: bool, detail: str) -> EvaluationCheck:
    if not applicable:
        return EvaluationCheck(name=name, status="skipped", detail="No expectation configured.")
    return EvaluationCheck(
        name=name,
        status="passed" if passed else "failed",
        detail=detail,
    )


def grade_evaluation(
    expectation: EvaluationExpectation,
    actual: EvaluationActual,
) -> EvaluationGrade:
    """Grade one result without model calls, database access, or side effects."""

    response = actual.response.casefold()
    required_missing = [term for term in expectation.required_terms if term.casefold() not in response]
    forbidden_found = [term for term in expectation.forbidden_terms if term.casefold() in response]
    expected_sources = set(expectation.expected_source_ids)
    actual_sources = set(actual.source_ids)
    missing_sources = sorted(expected_sources - actual_sources)

    checks = [
        _check(
            "expected_agent",
            expectation.expected_agent is not None,
            actual.agent == expectation.expected_agent,
            f"Expected agent {expectation.expected_agent!r}; received {actual.agent!r}.",
        ),
        _check(
            "required_terms",
            bool(expectation.required_terms),
            not required_missing,
            "All required terms were present."
            if not required_missing
            else f"Missing required terms: {', '.join(required_missing)}.",
        ),
        _check(
            "forbidden_terms",
            bool(expectation.forbidden_terms),
            not forbidden_found,
            "No forbidden terms were present."
            if not forbidden_found
            else f"Found forbidden terms: {', '.join(forbidden_found)}.",
        ),
        _check(
            "expected_sources",
            bool(expectation.expected_source_ids),
            not missing_sources,
            "All expected sources were present."
            if not missing_sources
            else f"Missing expected sources: {', '.join(missing_sources)}.",
        ),
        _check(
            "expected_rag_hit",
            expectation.expected_rag_hit is not None,
            actual.rag_hit == expectation.expected_rag_hit,
            f"Expected rag_hit={expectation.expected_rag_hit}; received {actual.rag_hit}.",
        ),
        _check(
            "expected_escalation",
            expectation.expected_escalation is not None,
            actual.escalated == expectation.expected_escalation,
            f"Expected escalated={expectation.expected_escalation}; received {actual.escalated}.",
        ),
        _check(
            "max_response_ms",
            expectation.max_response_ms is not None,
            actual.response_ms is not None and actual.response_ms <= expectation.max_response_ms,
            f"Maximum response time is {expectation.max_response_ms}ms; received {actual.response_ms}ms.",
        ),
    ]
    failures = [check.name for check in checks if check.status == "failed"]
    return EvaluationGrade(passed=not failures, checks=checks, failures=failures)

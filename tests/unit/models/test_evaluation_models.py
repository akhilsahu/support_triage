import uuid

from app.models.evaluation import (
    EvaluationCase,
    EvaluationResult,
    EvaluationRun,
    EvaluationSuite,
)


def test_evaluation_suite_is_tenant_and_chatbot_scoped() -> None:
    space_id = uuid.uuid4()
    chatbot_id = uuid.uuid4()
    suite = EvaluationSuite(
        space_id=space_id,
        chatbot_id=chatbot_id,
        name="Critical support flows",
        critical=True,
    )

    assert suite.space_id == space_id
    assert suite.chatbot_id == chatbot_id
    assert suite.critical is True


def test_evaluation_case_stores_expectations_separately_from_prompt() -> None:
    case = EvaluationCase(
        suite_id=uuid.uuid4(),
        space_id=uuid.uuid4(),
        name="Password reset",
        question="How do I reset my password?",
        history=[],
        customer_context={"plan": "pro"},
        expectations={"expected_agent": "support"},
    )

    assert case.question == "How do I reset my password?"
    assert case.expectations == {"expected_agent": "support"}
    assert case.customer_context == {"plan": "pro"}


def test_evaluation_run_and_result_keep_aggregate_and_check_data() -> None:
    run = EvaluationRun(
        suite_id=uuid.uuid4(),
        space_id=uuid.uuid4(),
        target="published",
        status="completed",
        total_cases=1,
        passed_cases=1,
        failed_cases=0,
    )
    result = EvaluationResult(
        run_id=uuid.uuid4(),
        case_id=uuid.uuid4(),
        space_id=run.space_id,
        passed=True,
        checks=[{"name": "expected_agent", "status": "passed"}],
        failures=[],
        actual_response="Use the reset link.",
        actual_source_ids=["doc-1"],
    )

    assert run.passed_cases == 1
    assert result.passed is True
    assert result.checks[0]["status"] == "passed"

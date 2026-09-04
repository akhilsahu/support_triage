import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.orchestra.ai.contracts import ConversationChannel
from app.services.evaluation_runner import (
    EvaluationExecutionError,
    build_evaluation_prompt,
    execute_evaluation_case,
    normalize_execution_result,
)


def _case(**overrides):
    values = {
        "id": uuid.uuid4(),
        "question": "How do I reset my password?",
        "history": [],
        "customer_context": {},
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_build_evaluation_prompt_keeps_context_separate_from_current_question() -> None:
    prompt = build_evaluation_prompt(
        _case(
            history=[{"role": "user", "content": "I cannot sign in."}],
            customer_context={"plan": "pro"},
        )
    )

    assert "UNTRUSTED EVALUATION CONTEXT" in prompt
    assert '"plan": "pro"' in prompt
    assert '"content": "I cannot sign in."' in prompt
    assert prompt.endswith("How do I reset my password?")


def test_build_evaluation_prompt_returns_question_when_context_is_empty() -> None:
    assert build_evaluation_prompt(_case()) == "How do I reset my password?"


def test_normalize_execution_result_drops_reasoning_and_normalizes_sources() -> None:
    actual = normalize_execution_result(
        {
            "reply": "Use the reset link.",
            "agent": "account",
            "rag_hit": True,
            "citations": [
                {"doc_id": "doc-1", "filename": "ignored.pdf"},
                {"filename": "fallback.pdf"},
                {"doc_id": "doc-1"},
            ],
            "reasoning": "private chain of thought",
            "blocks": [{"type": "card"}],
        },
        response_ms=42,
    )

    assert actual.response == "Use the reset link."
    assert actual.source_ids == ["doc-1", "fallback.pdf"]
    assert actual.escalated is False
    assert actual.response_ms == 42
    assert "reasoning" not in actual.model_dump()


@pytest.mark.parametrize(
    "result",
    [
        {"reply": "__ESCALATE__", "agent": "support"},
        {"reply": "Connecting you", "agent": "human"},
        {"reply": "Connecting you", "agent": "support", "escalate": True},
    ],
)
def test_normalize_execution_result_detects_escalation_intent(result: dict) -> None:
    assert normalize_execution_result(result, response_ms=1).escalated is True


def test_execute_case_uses_isolated_evaluation_context_without_clarification() -> None:
    space = SimpleNamespace(id=uuid.uuid4(), display_name="Acme")
    chatbot = SimpleNamespace(
        id=uuid.uuid4(),
        clarify_enabled=True,
        llm_model="model-a",
        reasoning_effort="low",
    )
    specialist = SimpleNamespace(agent_type="support", slug="support")
    leader = SimpleNamespace(agent_type="triage", slug="triage")
    executor = SimpleNamespace(run=AsyncMock(return_value={"reply": "Done", "agent": "support"}))

    with (
        patch(
            "app.services.evaluation_runner.load_all_active_agents",
            new=AsyncMock(return_value=[leader, specialist]),
        ),
        patch(
            "app.services.evaluation_runner.build_customer_executor",
            return_value=executor,
        ) as build,
    ):
        actual = asyncio.run(
            execute_evaluation_case(object(), space=space, chatbot=chatbot, case=_case())
        )

    assert actual.response == "Done"
    kwargs = build.call_args.kwargs
    assert kwargs["active_agents"] == [specialist]
    assert kwargs["leader"] is leader
    assert kwargs["clarify_enabled"] is False
    assert kwargs["runtime_namespace"] == "evaluation"
    assert kwargs["context"].channel is ConversationChannel.EVALUATION


def test_execute_case_rejects_chatbot_without_specialists() -> None:
    space = SimpleNamespace(id=uuid.uuid4(), display_name="Acme")
    chatbot = SimpleNamespace(id=uuid.uuid4(), llm_model=None, reasoning_effort=None)
    leader = SimpleNamespace(agent_type="triage", slug="triage")

    with patch(
        "app.services.evaluation_runner.load_all_active_agents",
        new=AsyncMock(return_value=[leader]),
    ):
        with pytest.raises(EvaluationExecutionError, match="no active specialist") as error:
            asyncio.run(
                execute_evaluation_case(object(), space=space, chatbot=chatbot, case=_case())
            )

    assert error.value.code == "no_active_agents"

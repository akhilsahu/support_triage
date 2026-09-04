import asyncio
import uuid
from unittest.mock import AsyncMock, patch

from app.orchestra.ai.contracts import ConversationExecutionContext
from app.orchestra.ai.customer_runtime import build_customer_executor
from app.orchestra.ai.core.config import AgnoConfig
from app.orchestra.ai.orchestrators.agno import AgnoOrchestrator


def test_build_customer_executor_forwards_canonical_context() -> None:
    context = ConversationExecutionContext(
        space_id=uuid.uuid4(),
        chatbot_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        conversation_id="external-id",
    )
    space = object()
    agents = [object()]
    leader = object()
    expected_executor = object()

    with patch(
        "app.orchestra.ai.customer_runtime.build_executor",
        return_value=expected_executor,
    ) as factory:
        executor = build_customer_executor(
            context=context,
            space=space,
            active_agents=agents,
            leader=leader,
            clarify_enabled=True,
            llm_model="openai/gpt-4o-mini",
            reasoning_effort="medium",
        )

    assert executor is expected_executor
    factory.assert_called_once_with(
        org=space,
        active_agents=agents,
        session_id=context.session_id_str,
        conversation_id="external-id",
        chatbot_id=context.chatbot_id_str,
        leader=leader,
        clarify_enabled=True,
        llm_model="openai/gpt-4o-mini",
        reasoning_effort="medium",
        runtime_namespace="production",
    )


def test_build_customer_executor_defaults_conversation_to_session() -> None:
    context = ConversationExecutionContext(
        space_id=uuid.uuid4(),
        chatbot_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
    )

    with patch("app.orchestra.ai.customer_runtime.build_executor") as factory:
        build_customer_executor(
            context=context,
            space=object(),
            active_agents=[],
            leader=None,
            clarify_enabled=False,
            llm_model=None,
            reasoning_effort=None,
        )

    assert factory.call_args.kwargs["conversation_id"] == context.session_id_str
    assert factory.call_args.kwargs["runtime_namespace"] == "production"


def test_evaluation_runtime_uses_separate_cache_and_disables_session_state() -> None:
    orchestrator = AgnoOrchestrator(
        space_id="space-1",
        org_name="Acme",
        active_agents=[],
        chatbot_id="bot-1",
        cfg=AgnoConfig(
            session_store="sqlite",
            session_db_url="sessions.db",
            history_enabled=True,
            user_memories_enabled=True,
            session_summaries_enabled=True,
            tools_enabled=True,
            mcp_enabled=True,
        ),
        runtime_namespace="evaluation",
    )

    effective = orchestrator._effective_cfg()
    assert effective.session_store == "none"
    assert effective.history_enabled is False
    assert effective.user_memories_enabled is False
    assert effective.session_summaries_enabled is False
    assert effective.tools_enabled is False
    assert effective.mcp_enabled is False

    with (
        patch(
            "app.orchestra.ai.orchestrators.agno._pool.get_or_init",
            new=AsyncMock(return_value=object()),
        ) as get_or_init,
        patch("app.orchestra.ai.orchestrators.agno._get_knowledge_backend", return_value=object()),
    ):
        asyncio.run(orchestrator._runner())

    assert get_or_init.call_args.kwargs["session_id"] == "space-1:bot-1:evaluation:team"

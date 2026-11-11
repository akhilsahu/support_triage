"""Build the Agno executor used by database-backed customer chat."""
from __future__ import annotations

from typing import Any, List

import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.models.space import Space
from app.orchestra.ai.contracts import ConversationExecutionContext

logger = structlog.get_logger()


def build_executor(
    org: Space,
    active_agents: List[ResolvedAgent],
    session_id: str,
    conversation_id: str = "",
    chatbot_id: str = "",
    leader: ResolvedAgent | None = None,
    clarify_enabled: bool = False,
    llm_model: str | None = None,
    reasoning_effort: str | None = None,
    runtime_namespace: str = "production",
) -> Any:
    """
    Return the Agno executor, preserving the shared customer-runtime interface.

    `leader` supplies the Team leader's routing instructions.
    `clarify_enabled` controls the owner's UserFeedbackTools (ask_user) toggle.
    `llm_model` / `reasoning_effort` are the chatbot-level LLM overrides.
    `conversation_id` remains accepted for compatibility with existing callers;
    Agno uses `session_id` for conversation state.

    The returned object always exposes:
        async def run(message: str) -> dict
            {reply, agent, intent, rag_hit, citations}
    """
    from app.orchestra.ai.inference.agno import AgnoOrchestrator

    return AgnoOrchestrator(
        space_id=str(org.id),
        org_name=str(org.display_name),
        active_agents=active_agents,
        session_id=session_id,
        chatbot_id=chatbot_id,
        leader=leader,
        clarify_enabled=clarify_enabled,
        llm_model=llm_model,
        reasoning_effort=reasoning_effort,
        runtime_namespace=runtime_namespace,
    )


def build_prepared_executor(*, space_id, session_id, cfg, messages, tools, history_db,
                            user_id, run_id, model_override=None):
    """Use the same executor with pre-authorized context and request-local tools."""
    from app.orchestra.ai.inference.agno import AgnoOrchestrator
    from app.orchestra.ai.inference.factories.agent import AgentFactory

    def runner_factory(effective_cfg):
        return AgentFactory(effective_cfg, str(space_id)).build_prepared(
            messages=messages, tools=tools, history_db=history_db,
            model_override=model_override,
        )

    return AgnoOrchestrator(
        space_id=str(space_id), org_name='', active_agents=[], session_id=session_id, cfg=cfg,
        runner_factory=runner_factory, request_ids=dict(user_id=user_id, run_id=run_id),
        strict_completion=True, emit_tool_events=True,
    )


def build_customer_executor(
    *,
    context: ConversationExecutionContext,
    space: Space,
    active_agents: list[ResolvedAgent],
    leader: ResolvedAgent | None,
    clarify_enabled: bool,
    llm_model: str | None,
    reasoning_effort: str | None,
    runtime_namespace: str = "production",
) -> Any:
    """Build the configured executor from canonical production-chat context."""

    logger.info(
        "customer_runtime.executor_build",
        space_id=context.space_id_str,
        chatbot_id=context.chatbot_id_str,
        session_id=context.session_id_str,
        channel=context.channel.value,
        active_agent_count=len(active_agents),
        clarify_enabled=clarify_enabled,
        llm_model=llm_model,
        reasoning_effort=reasoning_effort,
        runtime_namespace=runtime_namespace,
    )
    return build_executor(
        org=space,
        active_agents=active_agents,
        session_id=context.session_id_str,
        conversation_id=context.conversation_id or context.session_id_str,
        chatbot_id=context.chatbot_id_str,
        leader=leader,
        clarify_enabled=clarify_enabled,
        llm_model=llm_model,
        reasoning_effort=reasoning_effort,
        runtime_namespace=runtime_namespace,
    )

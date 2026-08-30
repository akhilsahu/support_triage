"""Production customer-chat executor construction.

The API layer resolves database-backed space, chatbot, and agent records. This
module owns the stable translation from that resolved state into the generic
orchestrator factory so streaming, non-streaming, and warmup paths cannot drift.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from app.orchestra.ai.contracts import ConversationExecutionContext
from app.orchestra.ai.core.factory import build_executor

if TYPE_CHECKING:
    from app.agents.resolved_agent import ResolvedAgent
    from app.models.space import Space


logger = structlog.get_logger()


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

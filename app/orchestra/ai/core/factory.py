"""
build_executor — unified executor factory.

Returns whichever backend is configured via settings.ORCHESTRATOR.
Both backends expose:  async def run(message: str) -> dict

This keeps the API layer free of any orchestrator branching logic.
"""
from __future__ import annotations

from typing import Any, List

from app.agents.resolved_agent import ResolvedAgent
from app.models.space import Space


def build_executor(
    org: Space,
    active_agents: List[ResolvedAgent],
    session_id: str,
    conversation_id: str = "",
) -> Any:
    """
    Return the configured executor.

    ORCHESTRATOR=agno   → AgnoOrchestrator  (keyword routing, SessionPool cache)
    ORCHESTRATOR=dynamic (default) → DynamicAgentExecutor (LLM triage, stateless)

    The returned object always exposes:
        async def run(message: str) -> dict
            {reply, agent, intent, rag_hit, citations}
    """
    from app.config import settings

    if settings.ORCHESTRATOR == "agno":
        from app.orchestra.ai.orchestrators.agno import AgnoOrchestrator
        return AgnoOrchestrator(
            space_id=str(org.id),
            org_name=str(org.display_name),
            active_agents=active_agents,
            session_id=session_id,
        )

    # Default: DynamicAgentExecutor — thin adapter normalises the run() signature.
    from app.agents.dynamic_executor import DynamicAgentExecutor
    _exec = DynamicAgentExecutor(org=org, active_agents=active_agents, mcp_server=None)
    _sid  = session_id
    _cid  = conversation_id

    class _Adapter:
        async def run(self, message: str) -> dict:
            return await _exec.run(message=message, session_id=_sid, conversation_id=_cid)

        async def stream(self, message: str):
            # DynamicAgentExecutor has no native streaming — yield one complete chunk
            result = await _exec.run(message=message, session_id=_sid, conversation_id=_cid)
            yield result.get("reply", "")

        async def warmup(self) -> None:
            pass  # DynamicAgentExecutor is stateless — nothing to pre-build

    return _Adapter()

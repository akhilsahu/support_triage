"""Session-safe bridge between cached agent runners and the tool registry."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.core.database import AsyncSessionLocal
from app.services.datasource.contracts import ExecutionContext
from app.services.datasource.registry import DataSourceToolRegistry, ToolDefinition

logger = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class RuntimeAgentIdentity:
    agent_id: UUID
    agent_kind: str


def identity_for(agent: ResolvedAgent) -> RuntimeAgentIdentity | None:
    """Return the persisted identity, or None for standalone/non-DB agents."""
    if not agent.source_id:
        return None
    try:
        return RuntimeAgentIdentity(
            agent_id=UUID(str(agent.source_id)),
            agent_kind="builtin" if agent.is_builtin else "custom",
        )
    except (TypeError, ValueError):
        logger.warning("datasource.runtime_invalid_agent_identity", agent_slug=agent.slug)
        return None


class DataSourceRuntime:
    """Loads definitions and executes calls using fresh application DB sessions.

    Agno runners are cached beyond an HTTP request. Holding the request's
    AsyncSession in a cached callback would use a closed session and could leak
    transaction state across conversations, so every operation opens its own
    short-lived session and the registry reauthorizes from current storage.
    """

    def __init__(self, space_id: str | UUID, chatbot_id: str | UUID) -> None:
        self.context = ExecutionContext(space_id=space_id, chatbot_id=chatbot_id)
        self._definitions: dict[str, list[ToolDefinition]] = {}

    async def preload(self, agents: list[ResolvedAgent]) -> None:
        async with AsyncSessionLocal() as db:
            registry = DataSourceToolRegistry(db)
            for agent in agents:
                identity = identity_for(agent)
                self._definitions[agent.slug] = (
                    await registry.list_tools(
                        self.context, identity.agent_id, identity.agent_kind,
                    ) if identity else []
                )

    def definitions_for(self, agent: ResolvedAgent) -> list[ToolDefinition]:
        return list(self._definitions.get(agent.slug, ()))

    async def refresh_for(self, agent: ResolvedAgent) -> list[ToolDefinition]:
        identity = identity_for(agent)
        if not identity:
            return []
        async with AsyncSessionLocal() as db:
            definitions = await DataSourceToolRegistry(db).list_tools(
                self.context, identity.agent_id, identity.agent_kind,
            )
        self._definitions[agent.slug] = definitions
        return definitions

    async def execute(
        self,
        agent: ResolvedAgent,
        definition: ToolDefinition,
        arguments: dict[str, Any],
    ) -> str:
        identity = identity_for(agent)
        if not identity:
            return json.dumps({"error": "tool_unavailable"})
        async with AsyncSessionLocal() as db:
            result = await DataSourceToolRegistry(db).execute(
                self.context,
                identity.agent_id,
                identity.agent_kind,
                definition.tool_id,
                arguments,
                expected_revision=definition.revision,
            )
        if result.failure:
            return json.dumps({
                "error": result.failure.code,
                "message": result.failure.message,
                "retryable": result.failure.retryable,
            })
        return json.dumps({"records": result.records}, separators=(",", ":"))


__all__ = ["DataSourceRuntime", "RuntimeAgentIdentity", "identity_for"]

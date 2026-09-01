"""Compatibility adapter exposing the application tool registry as MCP-like tools.

The canonical implementation lives in ``app.services.datasource``. This module
contains no HTTP, credential, tenancy, or response-mapping logic.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.agents.resolved_agent import ResolvedAgent
from app.services.datasource.contracts import ExecutionContext
from app.services.datasource.registry import DataSourceToolRegistry, ToolDefinition
from app.services.datasource.runtime import identity_for


class DataSourceMCPServer:
    """Backward-compatible list/call facade over ``DataSourceToolRegistry``.

    New callers provide a chatbot and resolved agent. The older space-only
    constructor remains accepted but exposes no tools, failing closed instead
    of reviving the former agent-type-wide authorization model.
    """

    def __init__(
        self,
        db,
        space_id: UUID,
        chatbot_id: UUID | None = None,
        agent: ResolvedAgent | None = None,
    ) -> None:
        self.context = (
            ExecutionContext(space_id=space_id, chatbot_id=chatbot_id)
            if chatbot_id is not None else None
        )
        self.agent = agent
        self._registry = DataSourceToolRegistry(db)
        self._definitions: dict[str, ToolDefinition] = {}

    async def load(self) -> None:
        identity = identity_for(self.agent) if self.agent else None
        if not self.context or not identity:
            self._definitions = {}
            return
        definitions = await self._registry.list_tools(
            self.context, identity.agent_id, identity.agent_kind,
        )
        self._definitions = {definition.name: definition for definition in definitions}

    def tool_definitions(self) -> list[dict[str, Any]]:
        return [definition.as_openai_tool() for definition in self._definitions.values()]

    async def call_tool(self, tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
        definition = self._definitions.get(tool_name)
        identity = identity_for(self.agent) if self.agent else None
        if not definition or not identity or not self.context:
            return {"error": "tool_unavailable"}
        result = await self._registry.execute(
            self.context,
            identity.agent_id,
            identity.agent_kind,
            definition.tool_id,
            args,
            expected_revision=definition.revision,
        )
        if result.failure:
            return {
                "error": result.failure.code,
                "message": result.failure.message,
                "retryable": result.failure.retryable,
            }
        return {"count": len(result.records), "records": result.records}


__all__ = ["DataSourceMCPServer"]

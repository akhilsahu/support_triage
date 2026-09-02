"""Tenant-, chatbot-, and agent-scoped discovery and dispatch of data-source tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.agent_tool_assignment import AgentToolAssignment
from app.models.chatbot import Chatbot
from app.models.datasource_connection import DataSourceConnection
from app.models.datasource_tool import DataSourceTool
from app.models.space import (
    BuiltinAgentCatalog,
    ChatbotCustomAgent,
    CustomAgent,
    Space,
    SpaceBuiltinAgentConfig,
)
from app.services.datasource.availability import datasource_feature_enabled
from app.services.datasource.contracts import (
    ExecutionContext,
    ExecutionFailure,
    ExecutionResult,
    ToolConfig,
)
from app.services.datasource.executor import DataSourceExecutor

TOOL_UNAVAILABLE = "tool_unavailable"
_SUPPORTED_AGENT_KINDS = frozenset({"builtin", "custom"})


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    """A model-callable definition plus immutable dispatch metadata."""

    name: str
    description: str
    input_schema: dict[str, Any]
    tool_id: UUID
    revision: int

    def as_openai_tool(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
            "metadata": {"tool_id": str(self.tool_id), "revision": self.revision},
        }


def _unavailable() -> ExecutionResult:
    # A single response for absent, disabled, stale, and unauthorized tools
    # avoids turning this boundary into an ownership/status oracle.
    return ExecutionResult(
        failure=ExecutionFailure(
            code=TOOL_UNAVAILABLE,
            message="The requested tool is unavailable",
            retryable=False,
        )
    )


class DataSourceToolRegistry:
    """Discover and execute tools only for an active, assigned agent identity."""

    def __init__(
        self,
        db: AsyncSession,
        executor: DataSourceExecutor | None = None,
    ) -> None:
        self._db = db
        self._executor = executor or DataSourceExecutor()

    async def list_tools(
        self,
        context: ExecutionContext,
        agent_id: UUID,
        agent_kind: str,
    ) -> list[ToolDefinition]:
        if agent_kind not in _SUPPORTED_AGENT_KINDS:
            return []
        if not await self._feature_enabled(context):
            return []
        result = await self._db.execute(
            self._authorized_query(context, agent_id, agent_kind)
            .order_by(DataSourceTool.name, DataSourceTool.id)
        )
        return [self._definition(row.tool) for row in result.scalars().all()]

    async def execute(
        self,
        context: ExecutionContext,
        agent_id: UUID,
        agent_kind: str,
        tool_id: UUID,
        arguments: dict[str, Any],
        *,
        expected_revision: int | None = None,
    ) -> ExecutionResult:
        """Reauthorize from storage immediately before resolving credentials.

        ``expected_revision`` is supplied from ToolDefinition metadata by a
        runtime. It is optional for compatibility with direct trusted callers;
        model runtimes should always provide it so cached definitions fail
        closed after edits.
        """
        if agent_kind not in _SUPPORTED_AGENT_KINDS:
            return _unavailable()
        if not await self._feature_enabled(context):
            return _unavailable()
        result = await self._db.execute(
            self._authorized_query(context, agent_id, agent_kind, tool_id=tool_id)
        )
        assignment = result.scalars().first()
        if assignment is None:
            return _unavailable()
        tool = assignment.tool
        if expected_revision is not None and tool.revision != expected_revision:
            return _unavailable()
        return await self._executor.execute(self._config(tool), arguments, context)

    async def _feature_enabled(self, context: ExecutionContext) -> bool:
        """Resolve runtime availability without exposing whether stored tools exist."""
        space = await self._db.get(Space, context.space_id)
        if space is None:
            return False
        return await datasource_feature_enabled(self._db, space)

    @staticmethod
    def _definition(tool: DataSourceTool) -> ToolDefinition:
        return ToolDefinition(
            name=f"{tool.name}_{tool.id.hex[:8]}",
            description=tool.description or tool.display_name or tool.name,
            input_schema=tool.input_schema,
            tool_id=tool.id,
            revision=tool.revision,
        )

    @staticmethod
    def _config(tool: DataSourceTool) -> ToolConfig:
        connection = tool.connection
        return ToolConfig(
            name=tool.name,
            method=tool.method,
            path=tool.path,
            input_schema=tool.input_schema,
            request_template=tool.request_template,
            record_path=tool.record_path,
            field_mapping=tool.output_mapping,
            max_records=tool.max_records,
            max_response_bytes=tool.max_response_bytes,
            risk_classification=tool.risk_classification,
            base_url=connection.base_url,
            default_headers=connection.default_headers,
            auth_type=connection.auth_type,
            auth_header=connection.auth_header,
            encrypted_secret=connection.encrypted_secret,
        )

    @staticmethod
    def _authorized_query(
        context: ExecutionContext,
        agent_id: UUID,
        agent_kind: str,
        *,
        tool_id: UUID | None = None,
    ):
        statement = (
            select(AgentToolAssignment)
            .join(DataSourceTool, AgentToolAssignment.tool_id == DataSourceTool.id)
            .join(DataSourceConnection, DataSourceTool.connection_id == DataSourceConnection.id)
            .join(Chatbot, AgentToolAssignment.chatbot_id == Chatbot.id)
            .options(joinedload(AgentToolAssignment.tool).joinedload(DataSourceTool.connection))
            .where(
                AgentToolAssignment.space_id == context.space_id,
                AgentToolAssignment.chatbot_id == context.chatbot_id,
                AgentToolAssignment.agent_id == agent_id,
                AgentToolAssignment.agent_kind == agent_kind,
                AgentToolAssignment.enabled.is_(True),
                DataSourceTool.space_id == context.space_id,
                DataSourceTool.status == "active",
                DataSourceConnection.space_id == context.space_id,
                DataSourceConnection.status == "active",
                Chatbot.space_id == context.space_id,
                Chatbot.active.is_(True),
            )
        )
        if tool_id is not None:
            statement = statement.where(DataSourceTool.id == tool_id)

        if agent_kind == "builtin":
            statement = statement.join(
                SpaceBuiltinAgentConfig,
                and_(
                    SpaceBuiltinAgentConfig.id == AgentToolAssignment.agent_id,
                    SpaceBuiltinAgentConfig.space_id == AgentToolAssignment.space_id,
                    SpaceBuiltinAgentConfig.chatbot_id == AgentToolAssignment.chatbot_id,
                ),
            ).join(
                BuiltinAgentCatalog,
                SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id,
            ).where(
                SpaceBuiltinAgentConfig.enabled.is_(True),
                BuiltinAgentCatalog.platform_enabled.is_(True),
                BuiltinAgentCatalog.agent_type != "triage",
            )
        else:
            statement = statement.join(
                CustomAgent,
                and_(
                    CustomAgent.id == AgentToolAssignment.agent_id,
                    CustomAgent.space_id == AgentToolAssignment.space_id,
                ),
            ).join(
                ChatbotCustomAgent,
                and_(
                    ChatbotCustomAgent.agent_id == CustomAgent.id,
                    ChatbotCustomAgent.chatbot_id == AgentToolAssignment.chatbot_id,
                ),
            ).where(CustomAgent.active.is_(True))
        return statement


__all__ = ["DataSourceToolRegistry", "TOOL_UNAVAILABLE", "ToolDefinition"]

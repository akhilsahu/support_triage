from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.services.datasource.contracts import ExecutionContext, ExecutionResult
from app.services.datasource.registry import DataSourceToolRegistry


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class FakeSession:
    def __init__(self, rows):
        self.rows = rows
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return SimpleNamespace(scalars=lambda: _Scalars(self.rows))


class SpyExecutor:
    def __init__(self):
        self.calls = []

    async def execute(self, config, arguments, context):
        self.calls.append((config, arguments, context))
        return ExecutionResult(records=[{"id": "A1"}])


def assigned_tool(*, revision=3):
    tool_id = UUID("12345678-1234-5678-1234-567812345678")
    connection = SimpleNamespace(
        status="active", base_url="https://example.test", default_headers={},
        auth_type="none", auth_header="Authorization", encrypted_secret=None,
    )
    tool = SimpleNamespace(
        id=tool_id, name="lookup_order", description="Look up an order", status="active",
        revision=revision, method="GET", path="/orders/{order_id}",
        input_schema={"type": "object", "properties": {"order_id": {"type": "string"}}},
        request_template={}, record_path="", output_mapping={}, max_records=20,
        max_response_bytes=1000, risk_classification="read", connection=connection,
    )
    return SimpleNamespace(tool=tool)


@pytest.fixture
def context():
    return ExecutionContext(space_id=uuid4(), chatbot_id=uuid4())


@pytest.mark.asyncio
async def test_list_tools_returns_collision_safe_openai_definition(context):
    assignment = assigned_tool()
    registry = DataSourceToolRegistry(FakeSession([assignment]))

    definitions = await registry.list_tools(context, uuid4(), "builtin")

    assert len(definitions) == 1
    definition = definitions[0]
    assert definition.name == "lookup_order_12345678"
    assert definition.tool_id == assignment.tool.id
    assert definition.revision == 3
    assert definition.as_openai_tool()["function"]["parameters"] == assignment.tool.input_schema

    sql = str(registry._db.statements[0])
    assert "JOIN data_source_connections" in sql
    assert "JOIN chatbots" in sql
    assert "JOIN space_builtin_agent_configs" in sql
    assert "JOIN builtin_agent_catalog" in sql
    assert "agent_tool_assignments.space_id" in sql
    assert "agent_tool_assignments.chatbot_id" in sql
    assert "data_source_tools.status" in sql
    assert "data_source_connections.status" in sql
    assert "builtin_agent_catalog.platform_enabled" in sql
    assert "builtin_agent_catalog.agent_type !=" in sql


@pytest.mark.asyncio
async def test_custom_discovery_requires_active_space_owned_chatbot_link(context):
    session = FakeSession([])
    registry = DataSourceToolRegistry(session)

    assert await registry.list_tools(context, uuid4(), "custom") == []

    sql = str(session.statements[0])
    assert "JOIN custom_agents" in sql
    assert "JOIN chatbot_custom_agents" in sql
    assert "custom_agents.space_id" in sql
    assert "custom_agents.active" in sql
    assert "chatbot_custom_agents.chatbot_id" in sql


@pytest.mark.asyncio
async def test_execute_reauthorizes_and_builds_complete_config(context):
    assignment = assigned_tool()
    executor = SpyExecutor()
    registry = DataSourceToolRegistry(FakeSession([assignment]), executor=executor)

    result = await registry.execute(
        context, uuid4(), "custom", assignment.tool.id, {"order_id": "A1"},
        expected_revision=3,
    )

    assert result.succeeded
    assert executor.calls[0][0].base_url == "https://example.test"
    assert executor.calls[0][0].name == "lookup_order"


@pytest.mark.asyncio
@pytest.mark.parametrize("rows", [[], [assigned_tool(revision=4)]])
async def test_execute_rejects_unavailable_or_stale_tool_before_http(context, rows):
    executor = SpyExecutor()
    registry = DataSourceToolRegistry(FakeSession(rows), executor=executor)

    result = await registry.execute(
        context, uuid4(), "builtin", uuid4(), {}, expected_revision=3,
    )

    assert result.failure.code == "tool_unavailable"
    assert executor.calls == []


@pytest.mark.asyncio
async def test_unknown_agent_kind_cannot_discover_or_execute(context):
    session = FakeSession([assigned_tool()])
    executor = SpyExecutor()
    registry = DataSourceToolRegistry(session, executor=executor)

    assert await registry.list_tools(context, uuid4(), "legacy") == []
    result = await registry.execute(context, uuid4(), "legacy", uuid4(), {})

    assert result.failure.code == "tool_unavailable"
    assert session.statements == []
    assert executor.calls == []

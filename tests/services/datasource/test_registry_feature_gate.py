from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.datasource.contracts import ExecutionContext
from app.services.datasource.registry import DataSourceToolRegistry, TOOL_UNAVAILABLE


class DisabledSession:
    def __init__(self, assignment):
        self.assignment = assignment
        self.execute_calls = 0

    async def get(self, _model, _identity):
        return SimpleNamespace(datasources_enabled=False)

    async def scalar(self, _statement):
        return SimpleNamespace(datasources_platform_enabled=True)

    async def execute(self, _statement):
        self.execute_calls += 1
        raise AssertionError("disabled discovery must short-circuit before assignments")


@pytest.mark.asyncio
async def test_disabled_feature_hides_tools_without_removing_assignment():
    assignment = SimpleNamespace(id=uuid4(), tool_id=uuid4())
    db = DisabledSession(assignment)
    registry = DataSourceToolRegistry(db)
    context = ExecutionContext(space_id=uuid4(), chatbot_id=uuid4())

    definitions = await registry.list_tools(context, uuid4(), "custom")
    result = await registry.execute(context, uuid4(), "custom", assignment.tool_id, {})

    assert definitions == []
    assert result.failure.code == TOOL_UNAVAILABLE
    assert db.assignment is assignment
    assert db.execute_calls == 0


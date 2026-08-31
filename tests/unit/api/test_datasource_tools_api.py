from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.datasource_tools import (
    _connection,
    _has_current_success,
    _public_tool,
    _post_commit_invalidate,
    _validate_assignment,
    delete_connection,
    delete_tool,
    execute_test,
    replace_assignments,
    create_connection,
    update_connection,
)
from app.models.agent_tool_assignment import DataSourceTestRun
from app.models.datasource_connection import DataSourceConnection
from app.models.datasource_tool import DataSourceTool
from app.schemas.datasource import (
    AgentAssignmentInput,
    AssignmentReplace,
    ConnectionCreate,
    ConnectionUpdate,
    ExecuteTestRequest,
    ToolCreate,
    ToolUpdate,
)
from app.services.datasource.contracts import ExecutionFailure, ExecutionResult


class FakeSession:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass

    async def refresh(self, value):
        if value.id is None:
            value.id = uuid4()

    async def delete(self, value):
        self.deleted = value

    def add_all(self, values):
        self.added.extend(values)


@pytest.mark.asyncio
async def test_connection_create_encrypts_secret_and_never_returns_it(monkeypatch):
    db = FakeSession()
    space = SimpleNamespace(id=uuid4())
    monkeypatch.setattr("app.api.v1.datasource_tools.encrypt", lambda value: f"cipher:{value}")
    monkeypatch.setattr("app.api.v1.datasource_tools._post_commit_invalidate", lambda *_: None)

    payload = await create_connection(
        ConnectionCreate(name="Orders", base_url="https://api.example.com", secret="plain-secret"),
        db=db,
        space=space,
    )

    assert db.added[0].encrypted_secret == "cipher:plain-secret"
    assert payload["credential_configured"] is True
    assert "secret" not in payload
    assert "encrypted_secret" not in payload


@pytest.mark.asyncio
async def test_connection_update_omitting_secret_preserves_ciphertext(monkeypatch):
    connection = DataSourceConnection(
        id=uuid4(), space_id=uuid4(), name="Orders", base_url="https://api.example.com",
        encrypted_secret="existing-ciphertext",
    )

    async def owned(*_):
        return connection

    async def no_tools(*_):
        class Result:
            def scalars(self): return self
            def all(self): return []
        return Result()

    db = FakeSession()
    db.execute = no_tools
    monkeypatch.setattr("app.api.v1.datasource_tools._connection", owned)
    monkeypatch.setattr("app.api.v1.datasource_tools._post_commit_invalidate", lambda *_: None)
    await update_connection(connection.id, ConnectionUpdate(name="Renamed"), db=db, space=SimpleNamespace(id=connection.space_id))
    assert connection.encrypted_secret == "existing-ciphertext"


def test_schema_container_defaults_are_not_shared():
    first = ExecuteTestRequest(chatbot_id=uuid4())
    second = ExecuteTestRequest(chatbot_id=uuid4())
    first.arguments["id"] = "A1"
    assert second.arguments == {}

    first_tool = ToolCreate(connection_id=uuid4(), name="find_order")
    second_tool = ToolCreate(connection_id=uuid4(), name="find_order_2")
    first_tool.request_template["query"] = {}
    assert second_tool.request_template == {}


def test_assignment_contract_rejects_triage_kind():
    with pytest.raises(ValidationError):
        AgentAssignmentInput(agent_kind="triage", agent_id=uuid4())


@pytest.mark.parametrize("field", [
    "name", "base_url", "auth_type", "auth_header", "default_headers", "status",
])
def test_connection_patch_rejects_explicit_null_except_secret(field):
    with pytest.raises(ValidationError):
        ConnectionUpdate.model_validate({field: None})
    assert ConnectionUpdate(secret=None).secret is None


@pytest.mark.parametrize("field", list(ToolUpdate.model_fields))
def test_tool_patch_rejects_every_explicit_null(field):
    with pytest.raises(ValidationError):
        ToolUpdate.model_validate({field: None})


def test_connection_contract_rejects_internal_auth_metadata():
    with pytest.raises(ValidationError):
        ConnectionCreate(name="Orders", base_url="https://example.com", auth_metadata={})


def test_public_tool_redacts_every_template_header_value():
    tool = DataSourceTool(name="find_order")
    tool.request_template = {"headers": {"Accept": "application/json", "X-Region": "{region}"}}
    payload = _public_tool(tool)
    assert payload["request_template"]["headers"] == {
        "Accept": "[REDACTED]", "X-Region": "[REDACTED]"
    }


@pytest.mark.asyncio
async def test_cross_space_connection_is_not_found():
    class MissingSession:
        async def scalar(self, _query): return None
    with pytest.raises(HTTPException) as exc:
        await _connection(MissingSession(), uuid4(), uuid4())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_connection_conflicts_when_tools_exist(monkeypatch):
    connection = DataSourceConnection(id=uuid4(), space_id=uuid4(), name="Orders")
    async def owned(*_): return connection
    class Result:
        def scalars(self): return self
        def all(self): return [uuid4()]
    db = FakeSession()
    db.execute = lambda *_: None
    async def execute(*_): return Result()
    db.execute = execute
    monkeypatch.setattr("app.api.v1.datasource_tools._connection", owned)
    with pytest.raises(HTTPException) as exc:
        await delete_connection(connection.id, db=db, space=SimpleNamespace(id=connection.space_id))
    assert exc.value.status_code == 409
    assert not hasattr(db, "deleted")


@pytest.mark.asyncio
async def test_delete_tool_conflicts_when_assignment_exists(monkeypatch):
    tool = DataSourceTool(id=uuid4(), space_id=uuid4(), name="find_order")
    async def owned(*_): return tool
    values = iter([uuid4(), None])
    db = FakeSession()
    async def scalar(*_): return next(values)
    db.scalar = scalar
    monkeypatch.setattr("app.api.v1.datasource_tools._tool", owned)
    with pytest.raises(HTTPException) as exc:
        await delete_tool(tool.id, db=db, space=SimpleNamespace(id=tool.space_id))
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_assignment_replacement_validates_all_before_delete(monkeypatch):
    tool_id, chatbot_id, space_id = uuid4(), uuid4(), uuid4()
    async def found(*_): return SimpleNamespace(id=uuid4())
    calls = []
    async def validate(*args):
        calls.append(args[-1])
        if len(calls) == 2:
            raise HTTPException(status_code=422, detail="invalid")
    db = FakeSession()
    async def execute(*_):
        raise AssertionError("delete must not run before all validation succeeds")
    db.execute = execute
    monkeypatch.setattr("app.api.v1.datasource_tools._tool", found)
    monkeypatch.setattr("app.api.v1.datasource_tools._chatbot", found)
    monkeypatch.setattr("app.api.v1.datasource_tools._validate_assignment", validate)
    request = AssignmentReplace(chatbot_id=chatbot_id, assignments=[
        AgentAssignmentInput(agent_kind="custom", agent_id=uuid4()),
        AgentAssignmentInput(agent_kind="custom", agent_id=uuid4()),
    ])
    with pytest.raises(HTTPException):
        await replace_assignments(tool_id, request, db=db, space=SimpleNamespace(id=space_id))
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_activation_gate_matches_successful_test_revision():
    tool = DataSourceTool(id=uuid4(), space_id=uuid4(), name="find_order", revision=3)
    old = DataSourceTestRun(outcome="success")
    old.diagnostics = {"tool_revision": 2}
    current = DataSourceTestRun(outcome="success")
    current.diagnostics = {"tool_revision": 3}
    class Result:
        def __init__(self, runs): self.runs = runs
        def scalars(self): return self
        def all(self): return self.runs
    class Session:
        def __init__(self, runs): self.runs = runs
        async def execute(self, _): return Result(self.runs)
    assert not await _has_current_success(Session([old]), tool)
    assert await _has_current_success(Session([old, current]), tool)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["builtin", "custom"])
async def test_assignment_validator_accepts_active_scoped_agents(kind):
    agent_id = uuid4()
    class Session:
        async def scalar(self, _query): return agent_id
    await _validate_assignment(Session(), uuid4(), uuid4(), kind, agent_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["builtin", "custom"])
async def test_assignment_validator_rejects_inactive_triage_or_wrong_chatbot(kind):
    class Session:
        async def scalar(self, _query): return None
    with pytest.raises(HTTPException) as exc:
        await _validate_assignment(Session(), uuid4(), uuid4(), kind, uuid4())
    assert exc.value.status_code == 422


def test_post_commit_invalidation_calls_targeted_hook(monkeypatch):
    from app.orchestra.ai.session.pool import pool
    seen = []
    monkeypatch.setattr(pool, "invalidate_datasource_runners", lambda space, bots: seen.append((space, bots)), raising=False)
    space_id, chatbot_id = uuid4(), uuid4()
    _post_commit_invalidate(space_id, {chatbot_id})
    assert seen == [(str(space_id), [str(chatbot_id)])]


@pytest.mark.asyncio
@pytest.mark.parametrize("execution_result, expected", [
    (ExecutionResult(records=[{"id": "A1"}], status_code=200, latency_ms=4), "success"),
    (ExecutionResult(failure=ExecutionFailure(code="upstream_error", message="Upstream request failed")), "failure"),
])
async def test_execute_test_persists_sanitized_success_and_failure(monkeypatch, execution_result, expected):
    space_id, chatbot_id = uuid4(), uuid4()
    connection = DataSourceConnection(id=uuid4(), space_id=space_id, name="Orders", base_url="https://example.com")
    tool = DataSourceTool(
        id=uuid4(), space_id=space_id, connection_id=connection.id, name="find_order",
        path="/orders", revision=2,
    )
    tool.input_schema = {"type": "object", "properties": {}}
    async def found_tool(*_): return tool
    async def found_connection(*_): return connection
    async def found_chatbot(*_): return SimpleNamespace(id=chatbot_id)
    class Executor:
        async def execute(self, *_): return execution_result
    db = FakeSession()
    monkeypatch.setattr("app.api.v1.datasource_tools._tool", found_tool)
    monkeypatch.setattr("app.api.v1.datasource_tools._connection", found_connection)
    monkeypatch.setattr("app.api.v1.datasource_tools._chatbot", found_chatbot)
    monkeypatch.setattr("app.api.v1.datasource_tools.DataSourceExecutor", lambda: Executor())
    payload = await execute_test(
        tool.id, ExecuteTestRequest(chatbot_id=chatbot_id), db=db, space=SimpleNamespace(id=space_id)
    )
    run = db.added[0]
    assert run.outcome == expected
    assert run.diagnostics == {"tool_revision": 2, "record_count": len(execution_result.records)}
    assert payload["outcome"] == expected
    assert "secret" not in str(payload).lower()

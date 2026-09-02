from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.v1.datasource_tools import list_agent_tools, replace_agent_tools
from app.models.datasource_connection import DataSourceConnection
from app.models.datasource_tool import DataSourceTool
from app.schemas.datasource import AgentToolReplace


class ScalarValues:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


class RecordingSession:
    def __init__(self, assignment_ids=()):
        self.assignment_ids = assignment_ids
        self.statements = []
        self.added = []
        self.commits = 0

    async def execute(self, statement):
        self.statements.append(statement)
        return ScalarValues(self.assignment_ids)

    def add_all(self, values):
        self.added.extend(values)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


def _active_tool(space_id):
    connection = DataSourceConnection(
        id=uuid4(), space_id=space_id, name="Orders API", status="active",
        base_url="https://example.com", encrypted_secret="ciphertext",
    )
    connection.default_headers = {"X-Api-Key": "secret"}
    tool = DataSourceTool(
        id=uuid4(), space_id=space_id, connection_id=connection.id,
        name="find_order", display_name="Find order", method="GET",
        path="/orders/{id}", status="active",
    )
    return tool, connection


def test_agent_tool_replace_rejects_duplicates_before_database_work():
    tool_id = uuid4()
    with pytest.raises(ValidationError, match="Duplicate tool assignment"):
        AgentToolReplace(chatbot_id=uuid4(), tool_ids=[tool_id, tool_id])


@pytest.mark.asyncio
async def test_get_returns_picker_fields_without_connection_secrets(monkeypatch):
    space_id, chatbot_id, agent_id = uuid4(), uuid4(), uuid4()
    tool, connection = _active_tool(space_id)
    db = RecordingSession([tool.id])

    async def found(*_args):
        return SimpleNamespace(id=chatbot_id)

    async def valid(*_args):
        return None

    async def active(*_args):
        return [(tool, connection)]

    monkeypatch.setattr("app.api.v1.datasource_tools._chatbot", found)
    monkeypatch.setattr("app.api.v1.datasource_tools._validate_assignment", valid)
    monkeypatch.setattr("app.api.v1.datasource_tools._active_tools", active)

    payload = await list_agent_tools(
        "custom", agent_id, chatbot_id, db=db, space=SimpleNamespace(id=space_id)
    )

    assert payload["tools"] == [{
        "id": str(tool.id),
        "name": "find_order",
        "display_name": "Find order",
        "method": "GET",
        "path": "/orders/{id}",
        "connection_name": "Orders API",
        "assigned": True,
    }]
    assert "ciphertext" not in repr(payload)
    assert "secret" not in repr(payload)


@pytest.mark.asyncio
async def test_replace_is_agent_scoped_and_commits_once(monkeypatch):
    space_id, chatbot_id, agent_id = uuid4(), uuid4(), uuid4()
    tools = [_active_tool(space_id), _active_tool(space_id)]
    db = RecordingSession()

    async def found(*_args):
        return SimpleNamespace(id=chatbot_id)

    async def valid(*_args):
        return None

    async def active(*_args):
        return tools

    monkeypatch.setattr("app.api.v1.datasource_tools._chatbot", found)
    monkeypatch.setattr("app.api.v1.datasource_tools._validate_assignment", valid)
    monkeypatch.setattr("app.api.v1.datasource_tools._active_tools", active)
    monkeypatch.setattr("app.api.v1.datasource_tools._post_commit_invalidate", lambda *_args: None)

    result = await replace_agent_tools(
        "custom", agent_id,
        AgentToolReplace(chatbot_id=chatbot_id, tool_ids=[item[0].id for item in tools]),
        db=db, space=SimpleNamespace(id=space_id),
    )

    assert {item["tool_id"] for item in result["assignments"]} == {
        str(item[0].id) for item in tools
    }
    assert db.commits == 1
    assert len(db.added) == 2
    delete_sql = str(db.statements[0].compile(
        dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
    ))
    assert "agent_tool_assignments.space_id" in delete_sql
    assert "agent_tool_assignments.chatbot_id" in delete_sql
    assert "agent_tool_assignments.agent_kind" in delete_sql
    assert "agent_tool_assignments.agent_id" in delete_sql
    assert "tool_id" not in delete_sql


@pytest.mark.asyncio
async def test_rejected_replacement_does_not_delete_existing_assignments(monkeypatch):
    space_id, chatbot_id, agent_id, unavailable_tool_id = (
        uuid4(), uuid4(), uuid4(), uuid4()
    )
    db = RecordingSession()

    async def found(*_args):
        return SimpleNamespace(id=chatbot_id)

    async def valid(*_args):
        return None

    async def no_active_tools(*_args):
        return []

    monkeypatch.setattr("app.api.v1.datasource_tools._chatbot", found)
    monkeypatch.setattr("app.api.v1.datasource_tools._validate_assignment", valid)
    monkeypatch.setattr("app.api.v1.datasource_tools._active_tools", no_active_tools)

    with pytest.raises(HTTPException) as exc:
        await replace_agent_tools(
            "custom", agent_id,
            AgentToolReplace(chatbot_id=chatbot_id, tool_ids=[unavailable_tool_id]),
            db=db, space=SimpleNamespace(id=space_id),
        )

    assert exc.value.status_code == 422
    assert db.statements == []
    assert db.added == []
    assert db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["builtin", "custom"])
async def test_agent_validation_failure_happens_before_tool_or_assignment_mutation(
    monkeypatch, kind
):
    space_id, chatbot_id, agent_id = uuid4(), uuid4(), uuid4()
    db = RecordingSession()

    async def found(*_args):
        return SimpleNamespace(id=chatbot_id)

    async def invalid(*_args):
        raise HTTPException(
            status_code=422,
            detail="Agent is inactive, unavailable, or outside this chatbot",
        )

    async def unexpected(*_args):
        raise AssertionError("tools must not be queried for an invalid agent")

    monkeypatch.setattr("app.api.v1.datasource_tools._chatbot", found)
    monkeypatch.setattr("app.api.v1.datasource_tools._validate_assignment", invalid)
    monkeypatch.setattr("app.api.v1.datasource_tools._active_tools", unexpected)

    with pytest.raises(HTTPException) as exc:
        await replace_agent_tools(
            kind, agent_id, AgentToolReplace(chatbot_id=chatbot_id),
            db=db, space=SimpleNamespace(id=space_id),
        )
    assert exc.value.status_code == 422
    assert db.statements == []

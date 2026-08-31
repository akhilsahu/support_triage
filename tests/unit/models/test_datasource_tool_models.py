import uuid

from app.models.agent_tool_assignment import AgentToolAssignment, DataSourceTestRun
from app.models.datasource_connection import DataSourceConnection
from app.models.datasource_tool import DataSourceTool


def test_connection_dict_never_serializes_secret() -> None:
    connection = DataSourceConnection(
        name="Orders",
        auth_type="bearer",
        encrypted_secret="cipher",
    )

    payload = connection.to_dict()

    assert "encrypted_secret" not in payload
    assert "secret" not in payload
    assert payload["credential_configured"] is True


def test_tool_json_properties_round_trip() -> None:
    tool = DataSourceTool(name="lookup_order")
    tool.input_schema = {"type": "object", "required": ["order_id"]}
    tool.request_template = {"query": {"id": "{order_id}"}}

    assert tool.input_schema["required"] == ["order_id"]
    assert tool.request_template["query"]["id"] == "{order_id}"


def test_all_structured_properties_round_trip() -> None:
    connection = DataSourceConnection(name="Orders")
    connection.default_headers = {"Accept": "application/json"}
    tool = DataSourceTool(name="lookup_order")
    tool.output_mapping = {"order_id": "id"}
    run = DataSourceTestRun(outcome="success")
    run.diagnostics = {"latency_ms": 42}

    assert connection.default_headers == {"Accept": "application/json"}
    assert tool.output_mapping == {"order_id": "id"}
    assert run.diagnostics == {"latency_ms": 42}


def test_assignment_keeps_a_stable_agent_identity() -> None:
    assignment = AgentToolAssignment(
        space_id=uuid.uuid4(),
        chatbot_id=uuid.uuid4(),
        tool_id=uuid.uuid4(),
        agent_kind="custom",
        agent_id=uuid.uuid4(),
    )

    assert assignment.agent_kind == "custom"
    assert assignment.agent_id is not None


def test_registry_uniqueness_constraints_are_declared() -> None:
    connection_constraints = {c.name for c in DataSourceConnection.__table__.constraints}
    tool_constraints = {c.name for c in DataSourceTool.__table__.constraints}
    assignment_constraints = {c.name for c in AgentToolAssignment.__table__.constraints}

    assert "uq_datasource_connection_space_name" in connection_constraints
    assert "uq_datasource_tool_space_name" in tool_constraints
    assert "uq_agent_tool_assignment_target" in assignment_constraints

import json
import importlib.util
from pathlib import Path
import uuid

import pytest

from app.models.agent_tool_assignment import AgentToolAssignment, DataSourceTestRun
from app.models.chatbot import Chatbot
from app.models.datasource import SpaceDataSource
from app.models.datasource_connection import DataSourceConnection
from app.models.datasource_tool import DataSourceTool


_MIGRATION_PATH = (
    Path(__file__).parents[3] / "alembic" / "versions" / "0047_datasource_tool_registry.py"
)
_MIGRATION_SPEC = importlib.util.spec_from_file_location(
    "datasource_tool_registry_migration", _MIGRATION_PATH,
)
assert _MIGRATION_SPEC and _MIGRATION_SPEC.loader
migration = importlib.util.module_from_spec(_MIGRATION_SPEC)
_MIGRATION_SPEC.loader.exec_module(migration)


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


@pytest.mark.parametrize(
    "auth_header",
    ["Authorization", "X-API-Key", "X-Custom-Auth", "X-Shopify-Access-Token"],
)
def test_connection_dict_redacts_standard_and_configured_auth_headers(auth_header) -> None:
    connection = DataSourceConnection(
        name="Orders",
        auth_header=auth_header,
        auth_metadata_json='{"token": "metadata-secret", "region": "west"}',
        default_headers_json=(
            '{"Authorization": "bearer-secret", "X-API-Key": "key-secret", '
            f'"{auth_header}": "custom-secret", "Accept": "application/json"}}'
        ),
    )

    payload = connection.to_dict()

    assert payload["default_headers"]["Authorization"] == "[REDACTED]"
    assert payload["default_headers"]["X-API-Key"] == "[REDACTED]"
    assert payload["default_headers"][auth_header] == "[REDACTED]"
    assert payload["default_headers"]["Accept"] == "[REDACTED]"
    assert payload["auth_metadata"]["token"] == "[REDACTED]"


@pytest.mark.parametrize(
    "auth_header",
    ["Authorization", "X-API-Key", "X-Custom-Auth", "X-Shopify-Access-Token"],
)
def test_legacy_dict_redacts_standard_and_configured_auth_headers(auth_header) -> None:
    source = SpaceDataSource(
        name="Orders",
        agent_type="order",
        api_url="https://example.test/orders",
        auth_header=auth_header,
    )
    source.request_headers = {
        "Authorization": "bearer-secret",
        "X-API-Key": "key-secret",
        auth_header: "custom-secret",
        "Accept": "application/json",
    }

    payload = source.to_dict()

    assert payload["request_headers"]["Authorization"] == "[REDACTED]"
    assert payload["request_headers"]["X-API-Key"] == "[REDACTED]"
    assert payload["request_headers"][auth_header] == "[REDACTED]"
    assert payload["request_headers"]["Accept"] == "[REDACTED]"


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


def test_assignment_rejects_tool_from_another_tenant() -> None:
    assignment = AgentToolAssignment(space_id=uuid.uuid4())
    tool = DataSourceTool(space_id=uuid.uuid4())

    with pytest.raises(ValueError, match="same space"):
        assignment.tool = tool


def test_assignment_rejects_chatbot_from_another_tenant() -> None:
    assignment = AgentToolAssignment(space_id=uuid.uuid4())
    chatbot = Chatbot(space_id=uuid.uuid4())

    with pytest.raises(ValueError, match="same space"):
        assignment.chatbot = chatbot


def test_assignment_rechecks_relationships_when_space_is_set_last() -> None:
    tool_space_id = uuid.uuid4()
    assignment = AgentToolAssignment(tool=DataSourceTool(space_id=tool_space_id))

    with pytest.raises(ValueError, match="same space"):
        assignment.space_id = uuid.uuid4()


def test_test_run_diagnostics_are_sanitized_on_storage_and_serialization() -> None:
    run = DataSourceTestRun(outcome="failure")
    run.diagnostics = {
        "headers": {
            "Authorization": "Bearer abc",
            "X-API-Key": "key",
            "X-Custom-Auth": "custom",
        }
    }

    assert "Bearer abc" not in run.diagnostics_json
    assert "key" not in run.diagnostics_json
    assert run.to_dict()["diagnostics"]["headers"] == {
        "Authorization": "[REDACTED]",
        "X-API-Key": "[REDACTED]",
        "X-Custom-Auth": "[REDACTED]",
    }


def test_test_run_serialization_sanitizes_legacy_unsanitized_diagnostics() -> None:
    run = DataSourceTestRun(outcome="failure")
    # Simulate a row loaded from before persistence-boundary sanitization.
    run.__dict__["diagnostics_json"] = (
        '{"Authorization": "Bearer abc", "token": "secret"}'
    )

    assert run.to_dict()["diagnostics"] == {
        "Authorization": "[REDACTED]",
        "token": "[REDACTED]",
    }


def test_test_run_sanitizes_direct_diagnostics_json_assignment_before_persistence() -> None:
    run = DataSourceTestRun(
        outcome="failure",
        diagnostics_json='{"Authorization": "Bearer abc", "safe": "ok"}',
    )

    assert json.loads(run.diagnostics_json) == {
        "Authorization": "[REDACTED]",
        "safe": "ok",
    }


def test_registry_uniqueness_constraints_are_declared() -> None:
    connection_constraints = {c.name for c in DataSourceConnection.__table__.constraints}
    tool_constraints = {c.name for c in DataSourceTool.__table__.constraints}
    assignment_constraints = {c.name for c in AgentToolAssignment.__table__.constraints}

    assert "uq_datasource_connection_space_name" in connection_constraints
    assert "uq_datasource_tool_space_name" in tool_constraints
    assert "uq_agent_tool_assignment_target" in assignment_constraints


def test_migrated_connection_name_is_truncated_before_duplicate_suffix() -> None:
    row_id = uuid.UUID("12345678-1234-5678-1234-567812345678")

    name = migration._connection_name("x" * 200, row_id, duplicate=True)

    assert name == f"{'x' * 189} (12345678)"
    assert len(name) == 200


def test_migration_removes_authentication_headers_from_defaults() -> None:
    headers = {
        "Authorization": "Bearer legacy",
        "X-API-Key": "legacy-key",
        "X-Custom-Auth": "legacy-custom",
        "Accept": "application/json",
    }

    sanitized = migration._without_auth_headers(headers, "X-Custom-Auth")

    assert sanitized == {"Accept": "application/json"}
    assert headers["Authorization"] == "Bearer legacy"

"""Add tenant-scoped data-source connections, tools, assignments, and test runs.

Revision ID: 0047_datasource_tool_registry
Revises: 0046_kb_missing_cols
Create Date: 2026-09-01
"""

import json
import re
import uuid
from urllib.parse import urlsplit, urlunsplit

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0047_datasource_tool_registry"
down_revision = "0046_kb_missing_cols"
branch_labels = None
depends_on = None


def _json_object(raw):
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def _placeholders(value):
    serialized = json.dumps(value, sort_keys=True)
    return sorted(set(re.findall(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", serialized)))


def _machine_name(name, row_id):
    stem = re.sub(r"[^a-z0-9]+", "_", (name or "lookup").lower()).strip("_")
    if not stem or not stem[0].isalpha():
        stem = f"lookup_{stem}"
    # The legacy identifier suffix makes the name deterministic and unique per space.
    return f"{stem[:54]}_{str(row_id).replace('-', '')[:8]}"[:64]


def _split_endpoint(api_url):
    parsed = urlsplit(api_url or "")
    if parsed.scheme and parsed.netloc:
        base_url = urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        return base_url, path
    return api_url or "", ""


def _migrate_legacy_rows():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "space_data_sources" not in inspector.get_table_names():
        return

    legacy = sa.table(
        "space_data_sources",
        sa.column("id"), sa.column("space_id"), sa.column("name"),
        sa.column("agent_type"), sa.column("api_url"), sa.column("method"),
        sa.column("auth_type"), sa.column("auth_value"), sa.column("auth_header"),
        sa.column("request_headers_json"), sa.column("request_params_json"),
        sa.column("request_body_json"), sa.column("field_mapping_json"),
        sa.column("active"), sa.column("created_at"), sa.column("updated_at"),
    )
    connections = sa.table(
        "data_source_connections",
        sa.column("id"), sa.column("space_id"), sa.column("name"), sa.column("status"),
        sa.column("base_url"), sa.column("auth_type"), sa.column("auth_header"),
        sa.column("encrypted_secret"), sa.column("auth_metadata_json"),
        sa.column("default_headers_json"), sa.column("created_at"), sa.column("updated_at"),
    )
    tools = sa.table(
        "data_source_tools",
        sa.column("id"), sa.column("space_id"), sa.column("connection_id"),
        sa.column("name"), sa.column("display_name"), sa.column("description"),
        sa.column("method"), sa.column("path"), sa.column("status"),
        sa.column("risk_classification"), sa.column("input_schema_json"),
        sa.column("request_template_json"), sa.column("output_mapping_json"),
        sa.column("record_path"), sa.column("max_records"),
        sa.column("max_response_bytes"), sa.column("revision"),
        sa.column("migration_warning"), sa.column("created_at"), sa.column("updated_at"),
    )

    used_connection_names = set()
    for row in bind.execute(sa.select(legacy)).mappings():
        connection_id = uuid.uuid4()
        tool_id = uuid.uuid4()
        headers = _json_object(row["request_headers_json"])
        params = _json_object(row["request_params_json"])
        body = _json_object(row["request_body_json"])
        output_mapping = _json_object(row["field_mapping_json"])
        base_url, path = _split_endpoint(row["api_url"])
        template = {"query": params, "headers": headers, "body": body}
        placeholders = _placeholders({"path": path, **template})
        input_schema = {
            "type": "object",
            "properties": {key: {"type": "string"} for key in placeholders},
            "required": placeholders,
        }
        warning = (
            f"Migrated from legacy target agent type '{row['agent_type']}'. "
            "Review the configuration, run a successful test, and assign a chatbot agent."
        )

        connection_name = row["name"]
        name_key = (row["space_id"], connection_name)
        if name_key in used_connection_names:
            connection_name = f"{connection_name} ({str(row['id'])[:8]})"
            name_key = (row["space_id"], connection_name)
        used_connection_names.add(name_key)

        bind.execute(connections.insert().values(
            id=connection_id,
            space_id=row["space_id"],
            # Preserve names unless a legacy space contains duplicates that the
            # new per-space uniqueness rule cannot represent verbatim.
            name=connection_name,
            status="active" if row["active"] else "disabled",
            base_url=base_url,
            auth_type=row["auth_type"] or "none",
            auth_header=row["auth_header"] or "Authorization",
            encrypted_secret=row["auth_value"] or None,
            auth_metadata_json="{}",
            default_headers_json=json.dumps(headers),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ))
        bind.execute(tools.insert().values(
            id=tool_id,
            space_id=row["space_id"],
            connection_id=connection_id,
            name=_machine_name(row["name"], row["id"]),
            display_name=row["name"],
            description=f"Migrated lookup for {row['name']}",
            method=(row["method"] or "GET").upper(),
            path=path,
            status="draft",
            risk_classification="read",
            input_schema_json=json.dumps(input_schema),
            request_template_json=json.dumps(template),
            output_mapping_json=json.dumps(output_mapping),
            record_path="",
            max_records=25,
            max_response_bytes=1_000_000,
            revision=1,
            migration_warning=warning,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ))


def upgrade():
    op.create_table(
        "data_source_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("base_url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("auth_type", sa.String(length=30), nullable=False, server_default="none"),
        sa.Column("auth_header", sa.String(length=100), nullable=False, server_default="Authorization"),
        sa.Column("encrypted_secret", sa.Text(), nullable=True),
        sa.Column("auth_metadata_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("default_headers_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("last_health_status", sa.String(length=30), nullable=True),
        sa.Column("last_health_message", sa.Text(), nullable=True),
        sa.Column("last_health_checked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("space_id", "name", name="uq_datasource_connection_space_name"),
    )
    op.create_index("ix_data_source_connections_space_id", "data_source_connections", ["space_id"])
    op.create_index("ix_data_source_connections_status", "data_source_connections", ["status"])

    op.create_table(
        "data_source_tools",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("method", sa.String(length=10), nullable=False, server_default="GET"),
        sa.Column("path", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("risk_classification", sa.String(length=20), nullable=False, server_default="read"),
        sa.Column("input_schema_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("request_template_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("output_mapping_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("record_path", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("max_records", sa.Integer(), nullable=False, server_default="25"),
        sa.Column("max_response_bytes", sa.Integer(), nullable=False, server_default="1000000"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("migration_warning", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["connection_id"], ["data_source_connections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("space_id", "name", name="uq_datasource_tool_space_name"),
    )
    op.create_index("ix_data_source_tools_space_id", "data_source_tools", ["space_id"])
    op.create_index("ix_data_source_tools_connection_id", "data_source_tools", ["connection_id"])
    op.create_index("ix_data_source_tools_status", "data_source_tools", ["status"])

    op.create_table(
        "agent_tool_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tool_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_kind", sa.String(length=20), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbots.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_id"], ["data_source_tools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "chatbot_id", "tool_id", "agent_kind", "agent_id",
            name="uq_agent_tool_assignment_target",
        ),
    )
    op.create_index("ix_agent_tool_assignments_space_id", "agent_tool_assignments", ["space_id"])
    op.create_index("ix_agent_tool_assignments_chatbot_id", "agent_tool_assignments", ["chatbot_id"])
    op.create_index("ix_agent_tool_assignments_tool_id", "agent_tool_assignments", ["tool_id"])
    op.create_index("ix_agent_tool_assignments_agent_id", "agent_tool_assignments", ["agent_id"])

    op.create_table(
        "data_source_test_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tool_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("outcome", sa.String(length=20), nullable=False),
        sa.Column("failure_category", sa.String(length=50), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("diagnostics_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["connection_id"], ["data_source_connections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_id"], ["data_source_tools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_data_source_test_runs_space_id", "data_source_test_runs", ["space_id"])
    op.create_index("ix_data_source_test_runs_connection_id", "data_source_test_runs", ["connection_id"])
    op.create_index("ix_data_source_test_runs_tool_id", "data_source_test_runs", ["tool_id"])
    op.create_index("ix_data_source_test_runs_created_at", "data_source_test_runs", ["created_at"])

    _migrate_legacy_rows()


def downgrade():
    op.drop_index("ix_data_source_test_runs_created_at", table_name="data_source_test_runs")
    op.drop_index("ix_data_source_test_runs_tool_id", table_name="data_source_test_runs")
    op.drop_index("ix_data_source_test_runs_connection_id", table_name="data_source_test_runs")
    op.drop_index("ix_data_source_test_runs_space_id", table_name="data_source_test_runs")
    op.drop_table("data_source_test_runs")
    op.drop_index("ix_agent_tool_assignments_agent_id", table_name="agent_tool_assignments")
    op.drop_index("ix_agent_tool_assignments_tool_id", table_name="agent_tool_assignments")
    op.drop_index("ix_agent_tool_assignments_chatbot_id", table_name="agent_tool_assignments")
    op.drop_index("ix_agent_tool_assignments_space_id", table_name="agent_tool_assignments")
    op.drop_table("agent_tool_assignments")
    op.drop_index("ix_data_source_tools_status", table_name="data_source_tools")
    op.drop_index("ix_data_source_tools_connection_id", table_name="data_source_tools")
    op.drop_index("ix_data_source_tools_space_id", table_name="data_source_tools")
    op.drop_table("data_source_tools")
    op.drop_index("ix_data_source_connections_status", table_name="data_source_connections")
    op.drop_index("ix_data_source_connections_space_id", table_name="data_source_connections")
    op.drop_table("data_source_connections")

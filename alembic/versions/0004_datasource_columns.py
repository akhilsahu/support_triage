"""Add missing columns to space_data_sources

Revision ID: 0004_datasource_columns
Revises: 0003_staff_inbox
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_datasource_columns"
down_revision = "0003_staff_inbox"
branch_labels = None
depends_on = None


def _col_exists(conn, table, col):
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ),
        {"t": table, "c": col},
    )
    return result.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    # session_waiting_queue missing status column (was omitted from 0003)
    if not _col_exists(conn, "session_waiting_queue", "status"):
        conn.execute(sa.text(
            "ALTER TABLE session_waiting_queue ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'waiting'"
        ))

    additions = [
        ("method",               "VARCHAR(10)  DEFAULT 'GET'"),
        ("auth_type",            "VARCHAR(20)  DEFAULT 'none'"),
        ("auth_value",           "TEXT         DEFAULT ''"),
        ("request_headers_json", "TEXT         DEFAULT '{}'"),
        ("request_params_json",  "TEXT         DEFAULT '{}'"),
        ("request_body_json",    "TEXT         DEFAULT '{}'"),
        ("field_mapping_json",   "TEXT         DEFAULT '{}'"),
    ]
    for col, ddl in additions:
        if not _col_exists(conn, "space_data_sources", col):
            conn.execute(sa.text(f"ALTER TABLE space_data_sources ADD COLUMN {col} {ddl}"))


def downgrade():
    for col in ["method", "auth_type", "auth_value", "request_headers_json",
                "request_params_json", "request_body_json", "field_mapping_json"]:
        op.drop_column("space_data_sources", col)

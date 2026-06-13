"""Fix missing columns from previous migrations

Revision ID: 0005_fix_missing_cols
Revises: 0004_datasource_columns
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_fix_missing_cols"
down_revision = "0004_datasource_columns"
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

    # session_waiting_queue.status — omitted from 0003
    if not _col_exists(conn, "session_waiting_queue", "status"):
        conn.execute(sa.text(
            "ALTER TABLE session_waiting_queue ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'waiting'"
        ))

    # space_data_sources columns — in case 0004 ran before table existed
    ds_cols = [
        ("method",               "VARCHAR(10)  DEFAULT 'GET'"),
        ("auth_type",            "VARCHAR(20)  DEFAULT 'none'"),
        ("auth_value",           "TEXT         DEFAULT ''"),
        ("request_headers_json", "TEXT         DEFAULT '{}'"),
        ("request_params_json",  "TEXT         DEFAULT '{}'"),
        ("request_body_json",    "TEXT         DEFAULT '{}'"),
        ("field_mapping_json",   "TEXT         DEFAULT '{}'"),
    ]
    for col, ddl in ds_cols:
        if not _col_exists(conn, "space_data_sources", col):
            conn.execute(sa.text(f"ALTER TABLE space_data_sources ADD COLUMN {col} {ddl}"))

    # conversation_logs missing columns — role, response_ms
    cl_cols = [
        ("role",        "VARCHAR(20) NOT NULL DEFAULT 'user'"),
        ("response_ms", "INTEGER"),
    ]
    for col, ddl in cl_cols:
        if not _col_exists(conn, "conversation_logs", col):
            conn.execute(sa.text(f"ALTER TABLE conversation_logs ADD COLUMN {col} {ddl}"))


def downgrade():
    pass

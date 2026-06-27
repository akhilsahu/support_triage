"""Add missing columns to agent_definitions

Revision ID: 0008_agent_def_cols
Revises: 0007_queue_assigned_at
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_agent_def_cols"
down_revision = "0007_queue_assigned_at"
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
    cols = [
        ("agent_type",   "VARCHAR(80) NOT NULL DEFAULT 'custom'"),
        ("base_prompt",  "TEXT DEFAULT ''"),
        ("system_prompt","TEXT DEFAULT ''"),
    ]
    for col, ddl in cols:
        if not _col_exists(conn, "agent_definitions", col):
            conn.execute(sa.text(f"ALTER TABLE agent_definitions ADD COLUMN {col} {ddl}"))


def downgrade():
    pass

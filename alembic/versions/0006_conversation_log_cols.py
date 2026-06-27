"""Add missing conversation_logs columns

Revision ID: 0006_conversation_log_cols
Revises: 0005_fix_missing_cols
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0006_conversation_log_cols"
down_revision = "0005_fix_missing_cols"
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
        ("role",        "VARCHAR(20) NOT NULL DEFAULT 'user'"),
        ("response_ms", "INTEGER"),
    ]
    for col, ddl in cols:
        if not _col_exists(conn, "conversation_logs", col):
            conn.execute(sa.text(f"ALTER TABLE conversation_logs ADD COLUMN {col} {ddl}"))


def downgrade():
    pass

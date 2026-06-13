"""Add assigned_at to session_waiting_queue

Revision ID: 0007_queue_assigned_at
Revises: 0006_conversation_log_cols
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_queue_assigned_at"
down_revision = "0006_conversation_log_cols"
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
    if not _col_exists(conn, "session_waiting_queue", "assigned_at"):
        conn.execute(sa.text("ALTER TABLE session_waiting_queue ADD COLUMN assigned_at TIMESTAMP"))


def downgrade():
    pass

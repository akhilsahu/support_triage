"""Add conversation_logs.feedback — customer thumbs up/down on an AI reply

Revision ID: 0023_message_feedback
Revises: 0022_chatbot_limits
Create Date: 2026-07-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0023_message_feedback"
down_revision = "0022_chatbot_limits"
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
    # NULL = no feedback given; "up" / "down" = customer rating on the AI reply.
    if not _col_exists(conn, "conversation_logs", "feedback"):
        conn.execute(sa.text(
            "ALTER TABLE conversation_logs ADD COLUMN feedback VARCHAR(10)"
        ))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "conversation_logs", "feedback"):
        conn.execute(sa.text("ALTER TABLE conversation_logs DROP COLUMN feedback"))

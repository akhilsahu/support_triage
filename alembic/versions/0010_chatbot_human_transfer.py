"""Add human transfer settings to chatbots

Revision ID: 0010_chatbot_human_transfer
Revises: 0009_drop_agent_definitions
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_chatbot_human_transfer"
down_revision = "0009_drop_agent_definitions"
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
    if not _col_exists(conn, "chatbots", "human_transfer_enabled"):
        conn.execute(sa.text(
            "ALTER TABLE chatbots ADD COLUMN human_transfer_enabled BOOLEAN NOT NULL DEFAULT TRUE"
        ))
    if not _col_exists(conn, "chatbots", "human_transfer_message"):
        conn.execute(sa.text(
            "ALTER TABLE chatbots ADD COLUMN human_transfer_message TEXT "
            "DEFAULT 'You''re being connected to a human agent. Please hold on.'"
        ))


def downgrade():
    pass

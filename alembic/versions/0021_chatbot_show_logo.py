"""Add show_logo toggle to chatbots

Revision ID: 0021_chatbot_show_logo
Revises: 0020_conversation_citations
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0021_chatbot_show_logo"
down_revision = "0020_conversation_citations"
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
    if not _col_exists(conn, "chatbots", "show_logo"):
        conn.execute(sa.text(
            "ALTER TABLE chatbots ADD COLUMN show_logo BOOLEAN NOT NULL DEFAULT TRUE"
        ))


def downgrade():
    pass

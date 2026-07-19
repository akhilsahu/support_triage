"""Add chatbots.homepage_sections_override — admin override for AI-recommended homepage sections

Revision ID: 0024_chatbot_homepage_sections
Revises: 0023_message_feedback
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0024_chatbot_homepage_sections"
down_revision = "0023_message_feedback"
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
    # NULL = defer to the renderengine's AI recommendation.
    if not _col_exists(conn, "chatbots", "homepage_sections_override"):
        conn.execute(sa.text(
            "ALTER TABLE chatbots ADD COLUMN homepage_sections_override TEXT"
        ))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "chatbots", "homepage_sections_override"):
        conn.execute(sa.text("ALTER TABLE chatbots DROP COLUMN homepage_sections_override"))

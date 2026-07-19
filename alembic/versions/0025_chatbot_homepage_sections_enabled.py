"""Add chatbots.homepage_sections_enabled — admin-config master switch for the homepage renderengine

Revision ID: 0025_chatbot_homepage_sections_enabled
Revises: 0024_chatbot_homepage_sections
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0025_hp_sections_enabled"
down_revision = "0024_chatbot_homepage_sections"
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
    # Default False: every existing bot keeps today's hardcoded empty state
    # until its admin explicitly turns this on.
    if not _col_exists(conn, "chatbots", "homepage_sections_enabled"):
        conn.execute(sa.text(
            "ALTER TABLE chatbots ADD COLUMN homepage_sections_enabled BOOLEAN NOT NULL DEFAULT FALSE"
        ))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "chatbots", "homepage_sections_enabled"):
        conn.execute(sa.text("ALTER TABLE chatbots DROP COLUMN homepage_sections_enabled"))

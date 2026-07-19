"""Add chatbots.quick_topics — admin-authored quick-topic buttons for the homepage 'quick_topics' section

Revision ID: 0027_chatbot_quick_topics
Revises: 0026_plat_hp_sections_en
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0027_qk_topics"
down_revision = "0026_plat_hp_sections_en"
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
    # NULL = no topics configured -- section doesn't render.
    if not _col_exists(conn, "chatbots", "quick_topics"):
        conn.execute(sa.text("ALTER TABLE chatbots ADD COLUMN quick_topics TEXT"))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "chatbots", "quick_topics"):
        conn.execute(sa.text("ALTER TABLE chatbots DROP COLUMN quick_topics"))

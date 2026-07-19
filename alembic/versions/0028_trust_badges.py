"""Add chatbots.trust_badges — admin-authored trust badges for the homepage 'trust_badges' section

Revision ID: 0028_trust_badges
Revises: 0027_qk_topics
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0028_trust_badges"
down_revision = "0027_qk_topics"
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
    if not _col_exists(conn, "chatbots", "trust_badges"):
        conn.execute(sa.text("ALTER TABLE chatbots ADD COLUMN trust_badges TEXT"))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "chatbots", "trust_badges"):
        conn.execute(sa.text("ALTER TABLE chatbots DROP COLUMN trust_badges"))

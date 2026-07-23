"""Add chatbot_comparison table -- admin-authored competitor comparison grid

Revision ID: 0030_comparison
Revises: 0029_stat_band
Create Date: 2026-07-20

One row per chatbot holding an admin-curated competitor comparison table
(columns + rows as JSONB, plus a source/date caption). Empty/absent = the
homepage 'comparison' section falls back to the AI/web generator. Admin figures
are the brand's OWN verified/cited data -- the compliance-safe source for
comparative claims about named competitors.
"""
from alembic import op
import sqlalchemy as sa

revision = "0030_comparison"
down_revision = "0029_stat_band"
branch_labels = None
depends_on = None


def _table_exists(conn, table):
    return conn.execute(sa.text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}).scalar() is not None


def upgrade():
    conn = op.get_bind()
    if not _table_exists(conn, "chatbot_comparison"):
        conn.execute(sa.text(
            """
            CREATE TABLE chatbot_comparison (
                chatbot_id  UUID PRIMARY KEY REFERENCES chatbots(id) ON DELETE CASCADE,
                columns     JSONB NOT NULL,
                rows        JSONB NOT NULL,
                source      VARCHAR(120),
                created_at  TIMESTAMP NOT NULL DEFAULT now()
            )
            """
        ))


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "chatbot_comparison"):
        conn.execute(sa.text("DROP TABLE chatbot_comparison"))

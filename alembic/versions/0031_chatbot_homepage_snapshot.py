"""Add chatbot_homepage_snapshot table -- frozen admin-curated welcome UI

Revision ID: 0031_homepage_snapshot
Revises: 0030_comparison
Create Date: 2026-07-25

One row per chatbot holding a frozen snapshot of the pre-chat welcome UI
(homepage_sections + every section's content + frozen suggestion chips, as a
single JSONB payload). When status='published' the public endpoint serves this
verbatim and skips all live LLM/web generation; absent or 'draft' falls back to
today's live generation path. Lets an admin generate the welcome once, edit it,
and publish it as static -- no per-request or background LLM cost.
"""
from alembic import op
import sqlalchemy as sa

revision = "0031_homepage_snapshot"
down_revision = "0030_comparison"
branch_labels = None
depends_on = None


def _table_exists(conn, table):
    return conn.execute(sa.text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}).scalar() is not None


def upgrade():
    conn = op.get_bind()
    if not _table_exists(conn, "chatbot_homepage_snapshot"):
        conn.execute(sa.text(
            """
            CREATE TABLE chatbot_homepage_snapshot (
                chatbot_id        UUID PRIMARY KEY REFERENCES chatbots(id) ON DELETE CASCADE,
                draft_payload     JSONB,
                published_payload JSONB,
                generated_at      TIMESTAMP,
                published_at      TIMESTAMP,
                published_by      UUID,
                created_at        TIMESTAMP NOT NULL DEFAULT now(),
                updated_at        TIMESTAMP NOT NULL DEFAULT now()
            )
            """
        ))


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "chatbot_homepage_snapshot"):
        conn.execute(sa.text("DROP TABLE chatbot_homepage_snapshot"))

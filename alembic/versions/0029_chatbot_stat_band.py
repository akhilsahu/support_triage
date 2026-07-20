"""Add chatbot_stat_metrics table -- admin-authored homepage trust metrics

Revision ID: 0029_stat_band
Revises: 0028_trust_badges
Create Date: 2026-07-20

One row per metric ({value, label}) an admin optionally enters with the brand's
OWN verified figures (claim ratio, lives covered). No rows = the homepage
'stat_band' section falls back to the AI/web generator. Kept in its own table
(not a JSON column) so metrics are individually addressable/orderable.
"""
from alembic import op
import sqlalchemy as sa

revision = "0029_stat_band"
down_revision = "0028_trust_badges"
branch_labels = None
depends_on = None


def _table_exists(conn, table):
    result = conn.execute(
        sa.text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}
    )
    return result.scalar() is not None


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
    # Clean up the interim column approach if a prior dev DB has it.
    if _col_exists(conn, "chatbots", "stat_band"):
        conn.execute(sa.text("ALTER TABLE chatbots DROP COLUMN stat_band"))

    if not _table_exists(conn, "chatbot_stat_metrics"):
        conn.execute(sa.text(
            """
            CREATE TABLE chatbot_stat_metrics (
                id          UUID PRIMARY KEY,
                chatbot_id  UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
                value       VARCHAR(20)  NOT NULL,
                label       VARCHAR(40)  NOT NULL,
                position    INTEGER      NOT NULL DEFAULT 0,
                created_at  TIMESTAMP    NOT NULL DEFAULT now()
            )
            """
        ))
        conn.execute(sa.text(
            "CREATE INDEX ix_chatbot_stat_metrics_chatbot_id ON chatbot_stat_metrics (chatbot_id)"
        ))


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "chatbot_stat_metrics"):
        conn.execute(sa.text("DROP TABLE chatbot_stat_metrics"))

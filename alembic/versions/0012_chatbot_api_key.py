"""Add api_key column to chatbots and back-fill existing rows

Revision ID: 0012_chatbot_api_key
Revises: 0011_nav_add_inbox
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_chatbot_api_key"
down_revision = "0011_nav_add_inbox"
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
    if not _col_exists(conn, "chatbots", "api_key"):
        conn.execute(sa.text(
            "ALTER TABLE chatbots ADD COLUMN api_key VARCHAR(36)"
        ))
    # Back-fill existing rows with a stable UUID derived from the chatbot id
    conn.execute(sa.text(
        "UPDATE chatbots SET api_key = gen_random_uuid()::text "
        "WHERE api_key IS NULL"
    ))
    # Enforce uniqueness / NOT NULL going forward
    conn.execute(sa.text(
        "ALTER TABLE chatbots ALTER COLUMN api_key SET NOT NULL"
    ))
    # Unique index (idempotent)
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_chatbots_api_key "
        "ON chatbots (api_key)"
    ))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_chatbots_api_key"))
    conn.execute(sa.text("ALTER TABLE chatbots DROP COLUMN IF EXISTS api_key"))

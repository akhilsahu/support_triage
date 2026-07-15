"""Add chatbot-limit columns: spaces.max_chatbots + platform_settings.default_max_chatbots

Revision ID: 0022_chatbot_limits
Revises: 0021_chatbot_show_logo
Create Date: 2026-07-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0022_chatbot_limits"
down_revision = "0021_chatbot_show_logo"
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
    # Per-space override — NULL means "inherit the platform default".
    if not _col_exists(conn, "spaces", "max_chatbots"):
        conn.execute(sa.text(
            "ALTER TABLE spaces ADD COLUMN max_chatbots INTEGER"
        ))
    # Global default — 1 keeps existing single-bot behaviour for everyone.
    if not _col_exists(conn, "platform_settings", "default_max_chatbots"):
        conn.execute(sa.text(
            "ALTER TABLE platform_settings "
            "ADD COLUMN default_max_chatbots INTEGER NOT NULL DEFAULT 1"
        ))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "platform_settings", "default_max_chatbots"):
        conn.execute(sa.text("ALTER TABLE platform_settings DROP COLUMN default_max_chatbots"))
    if _col_exists(conn, "spaces", "max_chatbots"):
        conn.execute(sa.text("ALTER TABLE spaces DROP COLUMN max_chatbots"))

"""Add nav config — enabled_nav_items on spaces + platform_settings table.

Revision ID: 0002_nav_config
Revises: 0001_initial
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = '0002_nav_config'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def _col_exists(conn, table: str, col: str) -> bool:
    r = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name=:t AND column_name=:c"
    ), {"t": table, "c": col})
    return r.fetchone() is not None


def _table_exists(conn, name: str) -> bool:
    r = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema='public' AND table_name=:n"
    ), {"n": name})
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()

    # Add enabled_nav_items to spaces if missing
    if not _col_exists(conn, "spaces", "enabled_nav_items"):
        op.add_column("spaces", sa.Column("enabled_nav_items", sa.Text(), nullable=True))

    # Create platform_settings table if missing
    if not _table_exists(conn, "platform_settings"):
        op.create_table(
            "platform_settings",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("nav_config", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        conn.execute(
            sa.text("INSERT INTO platform_settings (id, nav_config, created_at) VALUES (gen_random_uuid(), :cfg, NOW())"),
            {"cfg": '{"dashboard":true,"chat":true,"agents":true,"knowledge-base":true,"analytics":true,"data-sources":true,"settings":true}'},
        )


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "platform_settings"):
        op.drop_table("platform_settings")
    if _col_exists(conn, "spaces", "enabled_nav_items"):
        op.drop_column("spaces", "enabled_nav_items")

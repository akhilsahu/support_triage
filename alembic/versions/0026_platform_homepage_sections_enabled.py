"""Add platform_settings.homepage_sections_platform_enabled — Factor 1 (super admin) master switch for the homepage renderengine

Revision ID: 0026_platform_hp_sections_enabled
Revises: 0025_hp_sections_enabled
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0026_plat_hp_sections_en"
down_revision = "0025_hp_sections_enabled"
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
    # Default False: platform-wide off until a super admin explicitly enables it.
    if not _col_exists(conn, "platform_settings", "homepage_sections_platform_enabled"):
        conn.execute(sa.text(
            "ALTER TABLE platform_settings ADD COLUMN homepage_sections_platform_enabled "
            "BOOLEAN NOT NULL DEFAULT FALSE"
        ))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "platform_settings", "homepage_sections_platform_enabled"):
        conn.execute(sa.text(
            "ALTER TABLE platform_settings DROP COLUMN homepage_sections_platform_enabled"
        ))

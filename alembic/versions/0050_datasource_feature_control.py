"""Add platform and space Data Sources feature controls.

Revision ID: 0050_datasource_feature_control
Revises: fb1871f37217
Create Date: 2026-09-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0050_datasource_feature_control"
down_revision = "fb1871f37217"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "spaces",
        sa.Column("datasources_enabled", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "platform_settings",
        sa.Column(
            "datasources_platform_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("platform_settings", "datasources_platform_enabled")
    op.drop_column("spaces", "datasources_enabled")

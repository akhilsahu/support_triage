"""Add isolated Yullo appearance assets.

Revision ID: a9e2c11d7f42
Revises: f93ceaf3919d
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a9e2c11d7f42"
down_revision: str | None = "f93ceaf3919d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "yullo_appearance_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("alt_text", sa.String(length=300), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("byte_size > 0", name="ck_yullo_appearance_asset_size"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_yullo_appearance_asset_status"),
        sa.CheckConstraint("width > 0 AND height > 0", name="ck_yullo_appearance_asset_dimensions"),
        sa.ForeignKeyConstraint(["space_id"], ["yullo_spaces.space_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("space_id", "storage_key", name="uq_yullo_appearance_asset_storage"),
    )
    op.create_index(
        "ix_yullo_appearance_assets_space_id",
        "yullo_appearance_assets",
        ["space_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_yullo_appearance_assets_space_id", table_name="yullo_appearance_assets")
    op.drop_table("yullo_appearance_assets")

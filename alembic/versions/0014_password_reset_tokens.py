"""Add password_reset_token and password_reset_expires to spaces

Revision ID: 0014_password_reset_tokens
Revises: 0013_nav_add_embed_widget
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_password_reset_tokens"
down_revision = "0013_nav_add_embed_widget"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("password_reset_token", sa.String(255), nullable=True))
    op.add_column("spaces", sa.Column("password_reset_expires", sa.DateTime(), nullable=True))
    op.create_index("ix_spaces_password_reset_token", "spaces", ["password_reset_token"], unique=False)


def downgrade():
    op.drop_index("ix_spaces_password_reset_token", table_name="spaces")
    op.drop_column("spaces", "password_reset_expires")
    op.drop_column("spaces", "password_reset_token")

"""Add email_verified and email_verification_token to spaces

Revision ID: 0015_email_verification
Revises: 0014_password_reset_tokens
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_email_verification"
down_revision = "0014_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("spaces", sa.Column("email_verification_token", sa.String(255), nullable=True))
    op.create_index("ix_spaces_email_verification_token", "spaces", ["email_verification_token"], unique=False)


def downgrade():
    op.drop_index("ix_spaces_email_verification_token", table_name="spaces")
    op.drop_column("spaces", "email_verification_token")
    op.drop_column("spaces", "email_verified")

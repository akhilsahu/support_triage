"""Auth security hardening — verification token expiry + JWT token_version

Revision ID: 0016_auth_security
Revises: 0015_email_verification
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0016_auth_security"
down_revision = "0015_email_verification"
branch_labels = None
depends_on = None


def upgrade():
    # Email verification token expiry (24 h window)
    op.add_column("spaces", sa.Column("email_verification_expires", sa.DateTime(), nullable=True))

    # Per-space JWT version counter — increment to invalidate all live tokens
    op.add_column("spaces", sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"))


def downgrade():
    op.drop_column("spaces", "token_version")
    op.drop_column("spaces", "email_verification_expires")

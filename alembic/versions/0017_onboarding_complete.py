"""Add onboarding_complete to spaces

Revision ID: 0017_onboarding_complete
Revises: 0016_auth_security
Create Date: 2026-06-23
"""
import sqlalchemy as sa
from alembic import op

revision = "0017_onboarding_complete"
down_revision = "0016_auth_security"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column(
        "onboarding_complete", sa.Boolean(), nullable=False, server_default="false"
    ))


def downgrade():
    op.drop_column("spaces", "onboarding_complete")

"""Add inbox to platform_settings nav_config

Revision ID: 0011_nav_add_inbox
Revises: 0010_chatbot_human_transfer
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa
import json

revision = "0011_nav_add_inbox"
down_revision = "0010_chatbot_human_transfer"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text(
        "UPDATE platform_settings "
        "SET nav_config = (nav_config::jsonb || '{\"inbox\": true}'::jsonb)::text"
    ))


def downgrade():
    pass

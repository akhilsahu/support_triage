"""Add embed-widget to platform_settings nav_config

Revision ID: 0013_nav_add_embed_widget
Revises: 0012_chatbot_api_key
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa
import json

revision = "0013_nav_add_embed_widget"
down_revision = "0012_chatbot_api_key"
branch_labels = None
depends_on = None


def upgrade():
    # Use jsonb merge so we never overwrite existing keys
    op.execute(sa.text(
        "UPDATE platform_settings "
        "SET nav_config = (nav_config::jsonb || '{\"embed-widget\": true}'::jsonb)::text"
    ))


def downgrade():
    pass

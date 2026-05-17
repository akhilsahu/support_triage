"""add platform_enabled to agent_definitions

Revision ID: 0015_add_platform_enabled
Revises: 0014_drop_session_id_from_chat_sessions
Create Date: 2026-05-16
"""
import sqlalchemy as sa
from alembic import op

revision = '0015_add_platform_enabled'
down_revision = '0014_drop_session_id_from_chat_sessions'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'agent_definitions',
        sa.Column('platform_enabled', sa.Boolean(), server_default='true', nullable=False),
    )
    op.create_index(
        'ix_agent_def_platform_enabled',
        'agent_definitions',
        ['is_builtin', 'platform_enabled'],
    )


def downgrade():
    op.drop_index('ix_agent_def_platform_enabled', table_name='agent_definitions')
    op.drop_column('agent_definitions', 'platform_enabled')

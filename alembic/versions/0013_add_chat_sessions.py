"""add chat_sessions table

Revision ID: 0013_add_chat_sessions
Revises: 0012_add_agent_doc_links
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0013_add_chat_sessions'
down_revision = '0012_add_agent_doc_links'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'chat_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('session_id', sa.String(100), nullable=False, unique=True),
        sa.Column('title', sa.String(200), nullable=True),
        sa.Column('agent_slug', sa.String(80), nullable=True),
        sa.Column('status', sa.String(20), server_default='open', nullable=False),
        sa.Column('message_count', sa.Integer, server_default='0', nullable=False),
        sa.Column('started_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column('last_message_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_chat_sessions_org_last', 'chat_sessions',
                    ['org_id', 'last_message_at'])


def downgrade():
    op.drop_index('ix_chat_sessions_org_last', table_name='chat_sessions')
    op.drop_table('chat_sessions')

"""drop session_id from chat_sessions — use id as the session identifier

Revision ID: 0014_drop_session_id_from_chat_sessions
Revises: 0013_add_chat_sessions
Create Date: 2026-05-16
"""
from alembic import op

revision = '0014_drop_session_id_from_chat_sessions'
down_revision = '0013_add_chat_sessions'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('chat_sessions', 'session_id')


def downgrade():
    import sqlalchemy as sa
    op.add_column('chat_sessions',
        sa.Column('session_id', sa.String(100), nullable=True))

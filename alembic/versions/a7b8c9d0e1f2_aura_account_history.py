"""Bind Aura conversations to shared Yullo accounts or browser guest proofs."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a7b8c9d0e1f2'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('chat_sessions', sa.Column('yullo_user_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('chat_sessions', sa.Column('guest_token_hash', sa.String(64), nullable=True))
    op.create_foreign_key('fk_chat_sessions_yullo_user', 'chat_sessions', 'users', ['yullo_user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_chat_sessions_yullo_history', 'chat_sessions', ['yullo_user_id', 'space_id', 'runtime_type', 'last_message_at', 'id'])


def downgrade():
    op.drop_index('ix_chat_sessions_yullo_history', table_name='chat_sessions')
    op.drop_constraint('fk_chat_sessions_yullo_user', 'chat_sessions', type_='foreignkey')
    op.drop_column('chat_sessions', 'guest_token_hash')
    op.drop_column('chat_sessions', 'yullo_user_id')

"""add_runtime_identity_to_chat

Revision ID: 8d0fa921ce7c
Revises: 0061_harden_kb_facts
Create Date: 2026-09-18 20:53:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '8d0fa921ce7c'
down_revision: Union[str, None] = '0061_harden_kb_facts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Chat Sessions
    op.add_column('chat_sessions', sa.Column('runtime_type', sa.String(length=20), nullable=True))
    op.add_column('chat_sessions', sa.Column('runtime_id', sa.String(length=100), nullable=True))

    # 2. Message Thoughts
    op.add_column('message_thoughts', sa.Column('runtime_type', sa.String(length=20), nullable=True))
    op.add_column('message_thoughts', sa.Column('runtime_id', sa.String(length=100), nullable=True))

    # 3. Conversation Logs
    op.add_column('conversation_logs', sa.Column('runtime_type', sa.String(length=20), nullable=True))
    op.add_column('conversation_logs', sa.Column('runtime_id', sa.String(length=100), nullable=True))

    # 4. Conversation Events
    op.add_column('conversation_events', sa.Column('runtime_type', sa.String(length=20), nullable=True))
    op.add_column('conversation_events', sa.Column('runtime_id', sa.String(length=100), nullable=True))
    
    # Make chatbot_id nullable
    op.alter_column('conversation_events', 'chatbot_id',
               existing_type=sa.UUID(),
               nullable=True)


def downgrade() -> None:
    # 4. Conversation Events
    op.alter_column('conversation_events', 'chatbot_id',
               existing_type=sa.UUID(),
               nullable=False)
    op.drop_column('conversation_events', 'runtime_id')
    op.drop_column('conversation_events', 'runtime_type')

    # 3. Conversation Logs
    op.drop_column('conversation_logs', 'runtime_id')
    op.drop_column('conversation_logs', 'runtime_type')

    # 2. Message Thoughts
    op.drop_column('message_thoughts', 'runtime_id')
    op.drop_column('message_thoughts', 'runtime_type')

    # 1. Chat Sessions
    op.drop_column('chat_sessions', 'runtime_id')
    op.drop_column('chat_sessions', 'runtime_type')

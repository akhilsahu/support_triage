"""add_created_at_and_updated_at_timestamps_to_all_models

Revision ID: 26d5190864a1
Revises: 0068_identity_purpose_category
Create Date: 2026-09-25 14:54:08.278260

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26d5190864a1'
down_revision: Union[str, None] = '0068_identity_purpose_category'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Supply missing shared tables before adding their timestamp columns.
    if not sa.inspect(op.get_bind()).has_table("conversation_turns"):
        op.create_table(
            "conversation_turns",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("space_id", sa.UUID(), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("session_id", sa.UUID(), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("client_turn_id", sa.UUID(), nullable=False),
            sa.Column("request_hash", sa.String(64), nullable=False),
            sa.Column("runtime_type", sa.String(20), nullable=False),
            sa.Column("runtime_id", sa.String(100), nullable=False),
            sa.Column("runtime_version_id", sa.UUID(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("user_message_id", sa.UUID(), sa.ForeignKey("conversation_logs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("assistant_message_id", sa.UUID(), sa.ForeignKey("conversation_logs.id", ondelete="CASCADE"), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error_code", sa.String(80), nullable=True),
            sa.UniqueConstraint("session_id", "client_turn_id", name="uq_conv_turn_session_client"),
        )
        op.create_index("ix_conversation_turns_space_id", "conversation_turns", ["space_id"])
        op.create_index("ix_conversation_turns_session_id", "conversation_turns", ["session_id"])

    if not sa.inspect(op.get_bind()).has_table("yullo_home_events"):
        op.create_table(
            "yullo_home_events",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("space_id", sa.UUID(), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("subject_type", sa.String(50), nullable=False),
            sa.Column("subject_id", sa.String(100), nullable=False),
            sa.Column("dedupe_key", sa.String(180), nullable=False),
            sa.Column("event_metadata", sa.JSON(), nullable=True),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_yullo_home_events_space_id", "yullo_home_events", ["space_id"])
        op.create_index("uix_yullo_home_events_space_dedupe", "yullo_home_events", ["space_id", "dedupe_key"], unique=True)

    # Add created_at and updated_at timestamps with server_default=now() for full table consistency
    op.add_column('ai_usage_events', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))
    op.add_column('auth_identities', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('chat_sessions', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('chat_sessions', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('chatbot_user_identities', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('chatbot_users', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('conversation_events', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('conversation_turns', sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))
    op.add_column('conversation_turns', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))
    op.add_column('executions', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('message_thoughts', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('yullo_configs', sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))
    op.add_column('yullo_configs', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))
    op.add_column('yullo_home_events', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))
    op.add_column('yullo_user_sessions', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('yullo_user_sessions', 'updated_at')
    op.drop_column('yullo_home_events', 'updated_at')
    op.drop_column('yullo_configs', 'updated_at')
    op.drop_column('yullo_configs', 'created_at')
    op.alter_column('workflows', 'status',
               existing_type=sa.Enum('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', name='workflowstatus'),
               type_=sa.VARCHAR(length=50),
               existing_nullable=False,
               existing_server_default=sa.text("'draft'::character varying"))
    op.alter_column('workflows', 'execution_type',
               existing_type=sa.Enum('SEQUENTIAL', 'PARALLEL', 'CONDITIONAL', 'GRAPH', name='executiontype'),
               type_=sa.VARCHAR(length=50),
               existing_nullable=False)
    op.alter_column('tasks', 'status',
               existing_type=sa.Enum('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', name='taskstatus'),
               type_=sa.VARCHAR(length=50),
               existing_nullable=False,
               existing_server_default=sa.text("'pending'::character varying"))
    op.drop_column('message_thoughts', 'updated_at')
    op.alter_column('executions', 'status',
               existing_type=sa.Enum('STARTED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', name='executionstatus'),
               type_=sa.VARCHAR(length=50),
               existing_nullable=False)
    op.drop_column('executions', 'updated_at')
    op.drop_column('conversation_turns', 'updated_at')
    op.drop_column('conversation_turns', 'created_at')
    op.drop_column('conversation_events', 'updated_at')
    op.drop_column('chatbot_users', 'updated_at')
    op.drop_column('chatbot_user_identities', 'updated_at')
    op.drop_column('chat_sessions', 'updated_at')
    op.drop_column('chat_sessions', 'created_at')
    op.drop_column('auth_identities', 'updated_at')
    op.drop_column('ai_usage_events', 'updated_at')
    op.alter_column('agents', 'status',
               existing_type=sa.Enum('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR', name='agentstatus'),
               type_=sa.VARCHAR(length=50),
               existing_nullable=False,
               existing_server_default=sa.text("'active'::character varying"))
    op.alter_column('agents', 'type',
               existing_type=sa.Enum('CHAT', 'TASK', 'ANALYSIS', 'ORCHESTRATOR', 'CUSTOM', name='agenttype'),
               type_=sa.VARCHAR(length=50),
               existing_nullable=False)
    # ### end Alembic commands ###

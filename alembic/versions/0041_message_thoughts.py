"""Add message_thoughts table linking reasoning/thoughts to a message

Revision ID: 0041_message_thoughts
Revises: 0040_job_retry_payload
Create Date: 2026-08-07

One row per assistant ConversationLog that produced reasoning. PK IS the
message_id (conversation_logs.id), so every thought row is anchored to exactly
one customer-facing message. `content` is the merged reasoning text;
`segments` keeps per-delta granularity ({seq, content}) for faithful replay.
Denormalized space_id/session_id/chatbot_id/agent_slug mirror ConversationLog
so analytics joins don't need to hit conversation_logs to filter.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0041_message_thoughts"
down_revision = "0040_job_retry_payload"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "message_thoughts",
        sa.Column(
            "message_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conversation_logs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "space_id",
            UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_id", sa.String(100), nullable=False),
        sa.Column(
            "chatbot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chatbots.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("agent_slug", sa.String(80), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="reasoning"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("segments", JSONB(), nullable=True),
        sa.Column("model", sa.String(120), nullable=True),
        sa.Column("reasoning_effort", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_message_thoughts_space_id", "message_thoughts", ["space_id"])
    op.create_index("ix_message_thoughts_session_id", "message_thoughts", ["session_id"])


def downgrade():
    op.drop_index("ix_message_thoughts_session_id", table_name="message_thoughts")
    op.drop_index("ix_message_thoughts_space_id", table_name="message_thoughts")
    op.drop_table("message_thoughts")

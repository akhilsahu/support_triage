"""Add append-only production conversation lifecycle events.

Revision ID: 0043_conversation_events
Revises: 53ad0d7e7d9d
Create Date: 2026-08-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0043_conversation_events"
down_revision = "53ad0d7e7d9d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "conversation_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", sa.String(length=100), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("agent", sa.String(length=120), nullable=True),
        sa.Column("intent", sa.String(length=120), nullable=True),
        sa.Column("rag_hit", sa.Boolean(), nullable=True),
        sa.Column("response_ms", sa.Integer(), nullable=True),
        sa.Column("model", sa.String(length=160), nullable=True),
        sa.Column("reasoning_effort", sa.String(length=20), nullable=True),
        sa.Column("source_count", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column(
            "event_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbots.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["conversation_logs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_events_space_created",
        "conversation_events",
        ["space_id", "created_at"],
    )
    op.create_index(
        "ix_conversation_events_session_created",
        "conversation_events",
        ["session_id", "created_at"],
    )
    op.create_index(
        "ix_conversation_events_type_created",
        "conversation_events",
        ["event_type", "created_at"],
    )


def downgrade():
    op.drop_index("ix_conversation_events_type_created", table_name="conversation_events")
    op.drop_index("ix_conversation_events_session_created", table_name="conversation_events")
    op.drop_index("ix_conversation_events_space_created", table_name="conversation_events")
    op.drop_table("conversation_events")

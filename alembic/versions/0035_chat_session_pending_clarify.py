"""Add pending-clarify columns to chat_sessions (HITL ask_user pause/resume)

Revision ID: 0035_pending_clarify
Revises: 0034_triage_prompt
Create Date: 2026-07-31

See app/models/chat.py ChatSession — set together when a run pauses on
ask_user, cleared together when the next message resumes it.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0035_pending_clarify"
down_revision = "0034_triage_prompt"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("chat_sessions", sa.Column("pending_run_id", sa.String(length=64), nullable=True))
    op.add_column("chat_sessions", sa.Column("pending_requirement", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("chat_sessions", sa.Column("pending_since", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("chat_sessions", "pending_since")
    op.drop_column("chat_sessions", "pending_requirement")
    op.drop_column("chat_sessions", "pending_run_id")

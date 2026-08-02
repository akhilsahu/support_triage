"""Add clarify_enabled to chatbots (owner toggle for ask_user)

Revision ID: 0037_clarify_enabled
Revises: 0036_conversation_blocks
Create Date: 2026-08-01

See app/models/chatbot.py Chatbot.clarify_enabled and
docs/ambiguous-question-clarification-plan.md, "Where does the owner enable
this — chatbot or agent?"
"""
from alembic import op
import sqlalchemy as sa

revision = "0037_clarify_enabled"
down_revision = "0036_conversation_blocks"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "chatbots",
        sa.Column("clarify_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("chatbots", "clarify_enabled")

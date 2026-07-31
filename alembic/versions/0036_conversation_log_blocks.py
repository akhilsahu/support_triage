"""Add blocks column to conversation_logs (RenderTools structured content)

Revision ID: 0036_conversation_blocks
Revises: 0035_pending_clarify
Create Date: 2026-07-31

See app/models/space.py ConversationLog.blocks — mirrors the existing
`citations` column so a reply's structured table/card/tabs survive a page
reload the same way its citations already do.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0036_conversation_blocks"
down_revision = "0035_pending_clarify"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("conversation_logs", sa.Column("blocks", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade():
    op.drop_column("conversation_logs", "blocks")

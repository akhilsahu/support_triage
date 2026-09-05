"""escalation_brief — AI handoff brief for human agents

Adds chat_sessions.escalation_brief (JSONB): the summary/urgency/agent-brief
produced by app/orchestra/ai/workflows/escalation.py when AI escalates, so an
inbox agent starting the session already knows what the AI tried and why.

Revision ID: 0056_escalation_brief
Revises: 0055_csat
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0056_escalation_brief"
down_revision = "0055_csat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_sessions", sa.Column("escalation_brief", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("chat_sessions", "escalation_brief")
"""csat — customer satisfaction micro-poll on chat sessions

Adds csat_rating / csat_comment / csat_at to chat_sessions so owners can see
"how did we do" alongside deflection/volume, without a separate table.

Revision ID: 0055_csat
Revises: 0054_ai_usage_events
"""
from alembic import op
import sqlalchemy as sa

revision = "0055_csat"
down_revision = "0054_ai_usage_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_sessions", sa.Column("csat_rating", sa.SmallInteger, nullable=True))
    op.add_column("chat_sessions", sa.Column("csat_comment", sa.Text, nullable=True))
    op.add_column("chat_sessions", sa.Column("csat_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_sessions", "csat_at")
    op.drop_column("chat_sessions", "csat_comment")
    op.drop_column("chat_sessions", "csat_rating")
"""canned_replies — per-space quick replies for inbox agents

Adds canned_replies table: a short label + full body, scoped to a space.
Inbox agents can pick from these instead of retyping common answers.

Revision ID: 0057_canned_replies
Revises: 0056_escalation_brief
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0057_canned_replies"
down_revision = "0056_escalation_brief"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "canned_replies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("space_id", UUID(as_uuid=True), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_canned_replies_space_id", "canned_replies", ["space_id"])


def downgrade():
    op.drop_table("canned_replies")
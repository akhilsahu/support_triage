"""create agent_meta_suggestions table

Revision ID: 0018_agent_meta_suggestions
Revises: 0017_onboarding_complete
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0018_agent_meta_suggestions"
down_revision = "0017_onboarding_complete"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Table was created manually before this migration was written — skip if present
    exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_name = 'agent_meta_suggestions'"
    )).fetchone()

    if not exists:
        op.create_table(
            "agent_meta_suggestions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("space_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"),
                      nullable=False, index=True),
            sa.Column("agent_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("agent_definitions.id", ondelete="SET NULL"),
                      nullable=True, index=True),
            sa.Column("doc_id", sa.String(500), nullable=False, server_default=""),
            sa.Column("doc_type_key", sa.String(500), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    # Create index only if missing
    idx_exists = conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname = 'ix_agent_meta_suggestion_space_doc_type'"
    )).fetchone()
    if not idx_exists:
        op.create_index(
            "ix_agent_meta_suggestion_space_doc_type",
            "agent_meta_suggestions",
            ["space_id", "doc_id", "doc_type_key"],
            unique=True,
        )


def downgrade():
    op.drop_index("ix_agent_meta_suggestion_space_doc_type",
                  table_name="agent_meta_suggestions")
    op.drop_table("agent_meta_suggestions")

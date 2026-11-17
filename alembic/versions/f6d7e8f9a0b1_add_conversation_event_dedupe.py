"""Add the conversation event deduplication schema already required by Aura."""

from alembic import op
import sqlalchemy as sa


revision = "f6d7e8f9a0b1"
down_revision = "f5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade():
    # Legacy Support247 events keep NULL keys and remain outside deduplication.
    op.add_column(
        "conversation_events", sa.Column("dedupe_key", sa.String(180), nullable=True)
    )
    op.create_index(
        "uix_conversation_events_space_dedupe",
        "conversation_events",
        ["space_id", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text("dedupe_key IS NOT NULL"),
    )


def downgrade():
    op.drop_index("uix_conversation_events_space_dedupe", table_name="conversation_events")
    op.drop_column("conversation_events", "dedupe_key")

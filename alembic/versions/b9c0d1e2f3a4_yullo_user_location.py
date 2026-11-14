"""Keep the latest private Yullo location and server-observed IP per account."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b9c0d1e2f3a4"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "yullo_user_locations",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("area", postgresql.JSONB(), nullable=True),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
        sa.Column("source", sa.String(20), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("ip_observed_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("yullo_user_locations")

"""Isolated manual Beacon settings for published Yullo subspaces."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "yullo_space_beacons",
        sa.Column("space_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("yullo_spaces.space_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("state", sa.String(12), nullable=False),
        sa.Column("reach", sa.String(16), nullable=False),
        sa.Column("target_area", postgresql.JSONB(), nullable=False),
        sa.Column("origin_location_entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("yullo_space_entities.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("state IN ('active', 'paused')", name="ck_yullo_beacon_state"),
        sa.CheckConstraint("reach IN ('nearby_5', 'nearby_10', 'city', 'country', 'worldwide')", name="ck_yullo_beacon_reach"),
        sa.CheckConstraint("revision >= 1", name="ck_yullo_beacon_revision"),
    )
    op.create_index("ix_yullo_space_beacons_expires_at", "yullo_space_beacons", ["expires_at"])


def downgrade():
    op.drop_index("ix_yullo_space_beacons_expires_at", table_name="yullo_space_beacons")
    op.drop_table("yullo_space_beacons")

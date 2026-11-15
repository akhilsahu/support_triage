"""Support configurable Beacon radius while preserving legacy 5/10 km reaches."""
from alembic import op
import sqlalchemy as sa

revision = "f5c6d7e8f9a0"
down_revision = "f4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("yullo_space_beacons", sa.Column("radius_km", sa.Integer(), nullable=True))
    op.drop_constraint("ck_yullo_beacon_reach", "yullo_space_beacons", type_="check")
    op.create_check_constraint("ck_yullo_beacon_reach", "yullo_space_beacons", "reach IN ('nearby', 'nearby_5', 'nearby_10', 'city', 'country', 'worldwide')")
    op.create_check_constraint("ck_yullo_beacon_radius", "yullo_space_beacons", "radius_km IS NULL OR radius_km BETWEEN 10 AND 100")
    op.create_check_constraint("ck_yullo_beacon_nearby_radius", "yullo_space_beacons", "reach <> 'nearby' OR radius_km IS NOT NULL")


def downgrade():
    # Never silently discard owner-selected coverage when reverting the schema.
    op.execute("""DO $$ BEGIN IF EXISTS (SELECT 1 FROM yullo_space_beacons WHERE reach = 'nearby' OR radius_km IS NOT NULL)
        THEN RAISE EXCEPTION 'Convert configurable Beacons to legacy reaches before downgrading'; END IF; END $$""")
    op.drop_constraint("ck_yullo_beacon_nearby_radius", "yullo_space_beacons", type_="check")
    op.drop_constraint("ck_yullo_beacon_radius", "yullo_space_beacons", type_="check")
    op.drop_constraint("ck_yullo_beacon_reach", "yullo_space_beacons", type_="check")
    op.create_check_constraint("ck_yullo_beacon_reach", "yullo_space_beacons", "reach IN ('nearby_5', 'nearby_10', 'city', 'country', 'worldwide')")
    op.drop_column("yullo_space_beacons", "radius_km")

"""Allow Posting Spaces alongside the existing classifications."""
from alembic import op

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_yullo_space_type", "yullo_spaces", type_="check")
    op.create_check_constraint("ck_yullo_space_type", "yullo_spaces", "space_type IN ('space', 'event', 'project', 'location', 'community', 'service', 'job', 'other', 'posting')")


def downgrade():
    # Reclassify any Posting Spaces explicitly before downgrading.
    op.drop_constraint("ck_yullo_space_type", "yullo_spaces", type_="check")
    op.create_check_constraint("ck_yullo_space_type", "yullo_spaces", "space_type IN ('space', 'event', 'project', 'location', 'community', 'service', 'job', 'other')")

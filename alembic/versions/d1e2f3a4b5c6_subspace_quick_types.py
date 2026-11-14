"""Extend subspace classifications without changing existing records."""
from alembic import op

revision = "d1e2f3a4b5c6"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_yullo_space_type", "yullo_spaces", type_="check")
    op.create_check_constraint("ck_yullo_space_type", "yullo_spaces", "space_type IN ('space', 'event', 'project', 'location', 'community', 'service', 'job', 'other')")


def downgrade():
    # Existing new classifications must be explicitly reclassified before downgrade.
    op.drop_constraint("ck_yullo_space_type", "yullo_spaces", type_="check")
    op.create_check_constraint("ck_yullo_space_type", "yullo_spaces", "space_type IN ('space', 'event', 'project', 'location', 'community')")

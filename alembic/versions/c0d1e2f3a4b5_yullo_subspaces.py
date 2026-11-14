"""Add owner-managed Yullo Space hierarchy and classification."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c0d1e2f3a4b5"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("yullo_spaces", sa.Column("parent_space_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("yullo_spaces", sa.Column("space_type", sa.String(30), nullable=False, server_default="space"))
    op.add_column("yullo_spaces", sa.Column("hierarchy_revision", sa.Integer(), nullable=False, server_default="1"))
    op.create_foreign_key("fk_yullo_space_parent", "yullo_spaces", "yullo_spaces", ["parent_space_id"], ["space_id"], ondelete="RESTRICT")
    op.create_index("ix_yullo_spaces_parent_space_id", "yullo_spaces", ["parent_space_id"])
    op.create_check_constraint("ck_yullo_space_not_own_parent", "yullo_spaces", "parent_space_id IS NULL OR parent_space_id <> space_id")
    op.create_check_constraint("ck_yullo_space_type", "yullo_spaces", "space_type IN ('space', 'event', 'project', 'location', 'community')")
    op.create_check_constraint("ck_yullo_hierarchy_revision", "yullo_spaces", "hierarchy_revision >= 1")


def downgrade():
    op.drop_constraint("ck_yullo_hierarchy_revision", "yullo_spaces", type_="check")
    op.drop_constraint("ck_yullo_space_type", "yullo_spaces", type_="check")
    op.drop_constraint("ck_yullo_space_not_own_parent", "yullo_spaces", type_="check")
    op.drop_index("ix_yullo_spaces_parent_space_id", table_name="yullo_spaces")
    op.drop_constraint("fk_yullo_space_parent", "yullo_spaces", type_="foreignkey")
    op.drop_column("yullo_spaces", "hierarchy_revision")
    op.drop_column("yullo_spaces", "space_type")
    op.drop_column("yullo_spaces", "parent_space_id")

"""Explicit version-bound public source resource access, isolated from ingestion."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "f4b5c6d7e8f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("yullo_source_resources",
        sa.Column("source_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_kb_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shared_source_version", sa.Integer(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["source_id", "space_id", "source_kb_id"],
            ["knowledge_base_items.id", "knowledge_base_items.space_id", "knowledge_base_items.kb_id"], ondelete="CASCADE"),
        sa.CheckConstraint("shared_source_version IS NULL OR shared_source_version >= 1", name="ck_yullo_resource_version"),
        sa.CheckConstraint("revision >= 1", name="ck_yullo_resource_revision"))
    op.create_index("ix_yullo_source_resources_space_id", "yullo_source_resources", ["space_id"])


def downgrade():
    op.drop_index("ix_yullo_source_resources_space_id", table_name="yullo_source_resources")
    op.drop_table("yullo_source_resources")

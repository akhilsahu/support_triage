"""Add source column to ingestion_jobs (file vs url)

Revision ID: 0038_job_source
Revises: 0037_clarify_enabled
Create Date: 2026-08-02

Lets the KB screen show a job's progress under the tab it belongs to. Existing
rows are backfilled to "file": every job that predates URL ingestion was an
upload.
"""
from alembic import op
import sqlalchemy as sa

revision = "0038_job_source"
down_revision = "0037_clarify_enabled"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "ingestion_jobs",
        sa.Column("source", sa.String(length=20), nullable=False, server_default="file"),
    )


def downgrade():
    op.drop_column("ingestion_jobs", "source")

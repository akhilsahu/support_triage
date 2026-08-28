"""Add retry_payload column to ingestion_jobs

Revision ID: 0040_job_retry_payload
Revises: 0039_topic_meta_facts
Create Date: 2026-08-07

Captures the ingest_document task arguments (JSON-safe) on the job row at
enqueue time, so a failed/interrupted job can be re-queued by the retry
endpoint instead of forcing the user to upload the document again. Existing
rows are left NULL — they have no replayable payload.
"""
from alembic import op
import sqlalchemy as sa

revision = "0040_job_retry_payload"
down_revision = "0039_topic_meta_facts"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "ingestion_jobs",
        sa.Column("retry_payload", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("ingestion_jobs", "retry_payload")

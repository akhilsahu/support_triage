"""Add missing columns to ingestion_jobs table

Revision ID: 0045_job_eta_costs
Revises: 0044_evaluation_harness
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa

revision = "0045_job_eta_costs"
down_revision = "0044_evaluation_harness"
branch_labels = None
depends_on = None


def upgrade():
    # Some development databases received these model columns through an
    # earlier create_all run before the Alembic revision was stamped. Keep the
    # migration safe for both clean databases and those drifted installations.
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("ingestion_jobs")}
    columns = (
        sa.Column("eta_seconds", sa.Integer(), nullable=True),
        sa.Column("context_enriched", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("ai_cost_usd", sa.Float(), nullable=True, server_default="0.0"),
    )
    for column in columns:
        if column.name not in existing:
            op.add_column("ingestion_jobs", column)


def downgrade():
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("ingestion_jobs")}
    for name in ("ai_cost_usd", "context_enriched", "eta_seconds"):
        if name in existing:
            op.drop_column("ingestion_jobs", name)

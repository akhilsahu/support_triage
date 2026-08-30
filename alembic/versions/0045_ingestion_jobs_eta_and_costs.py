"""Add missing columns to ingestion_jobs table

Revision ID: 0045_ingestion_jobs_eta_and_costs
Revises: 0044_evaluation_harness
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa

revision = "0045_ingestion_jobs_eta_and_costs"
down_revision = "0044_evaluation_harness"
branch_labels = None
depends_on = None


def upgrade():
    # Add eta_seconds (Integer)
    op.add_column(
        "ingestion_jobs",
        sa.Column("eta_seconds", sa.Integer(), nullable=True),
    )
    # Add context_enriched (Boolean, default False)
    op.add_column(
        "ingestion_jobs",
        sa.Column("context_enriched", sa.Boolean(), nullable=True, server_default=sa.false()),
    )
    # Add ai_cost_usd (Float, default 0.0)
    op.add_column(
        "ingestion_jobs",
        sa.Column("ai_cost_usd", sa.Float(), nullable=True, server_default="0.0"),
    )


def downgrade():
    op.drop_column("ingestion_jobs", "ai_cost_usd")
    op.drop_column("ingestion_jobs", "context_enriched")
    op.drop_column("ingestion_jobs", "eta_seconds")

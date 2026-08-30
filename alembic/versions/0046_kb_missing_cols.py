"""Add missing columns to agent_knowledge_bases and knowledge_base_items tables

Revision ID: 0046_kb_missing_cols
Revises: 0045_job_eta_costs
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa

revision = "0046_kb_missing_cols"
down_revision = "0045_job_eta_costs"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add doc_ids to agent_knowledge_bases
    op.add_column(
        "agent_knowledge_bases",
        sa.Column("doc_ids", sa.JSON(), nullable=True),
    )

    # 2. Add description, context_enriched, and ai_cost_usd to knowledge_base_items
    op.add_column(
        "knowledge_base_items",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "knowledge_base_items",
        sa.Column("context_enriched", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "knowledge_base_items",
        sa.Column("ai_cost_usd", sa.Float(), nullable=False, server_default="0.0"),
    )


def downgrade():
    op.drop_column("knowledge_base_items", "ai_cost_usd")
    op.drop_column("knowledge_base_items", "context_enriched")
    op.drop_column("knowledge_base_items", "description")
    op.drop_column("agent_knowledge_bases", "doc_ids")

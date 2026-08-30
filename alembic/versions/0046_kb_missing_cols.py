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


def _column_exists(table_name, column_name):
    conn = op.get_bind()
    query = sa.text(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.columns "
        "  WHERE table_name = :table_name AND column_name = :column_name"
        ")"
    )
    return conn.scalar(query, {"table_name": table_name, "column_name": column_name})


def upgrade():
    # 1. Add doc_ids to agent_knowledge_bases if it doesn't exist
    if not _column_exists("agent_knowledge_bases", "doc_ids"):
        op.add_column(
            "agent_knowledge_bases",
            sa.Column("doc_ids", sa.JSON(), nullable=True),
        )

    # 2. Add description, context_enriched, and ai_cost_usd to knowledge_base_items if they don't exist
    if not _column_exists("knowledge_base_items", "description"):
        op.add_column(
            "knowledge_base_items",
            sa.Column("description", sa.Text(), nullable=True),
        )
    if not _column_exists("knowledge_base_items", "context_enriched"):
        op.add_column(
            "knowledge_base_items",
            sa.Column("context_enriched", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if not _column_exists("knowledge_base_items", "ai_cost_usd"):
        op.add_column(
            "knowledge_base_items",
            sa.Column("ai_cost_usd", sa.Float(), nullable=False, server_default="0.0"),
        )


def downgrade():
    if _column_exists("knowledge_base_items", "ai_cost_usd"):
        op.drop_column("knowledge_base_items", "ai_cost_usd")
    if _column_exists("knowledge_base_items", "context_enriched"):
        op.drop_column("knowledge_base_items", "context_enriched")
    if _column_exists("knowledge_base_items", "description"):
        op.drop_column("knowledge_base_items", "description")
    if _column_exists("agent_knowledge_bases", "doc_ids"):
        op.drop_column("agent_knowledge_bases", "doc_ids")

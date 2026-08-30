"""Add tenant-scoped chatbot evaluation harness.

Revision ID: 0044_evaluation_harness
Revises: 0043_conversation_events
Create Date: 2026-08-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0044_evaluation_harness"
down_revision = "0043_conversation_events"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "evaluation_suites",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("critical", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbots.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evaluation_suites_space_created", "evaluation_suites", ["space_id", "created_at"])
    op.create_index("ix_evaluation_suites_chatbot", "evaluation_suites", ["chatbot_id"])

    op.create_table(
        "evaluation_cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("suite_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("history", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("customer_context", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("expectations", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suite_id"], ["evaluation_suites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evaluation_cases_suite_created", "evaluation_cases", ["suite_id", "created_at"])
    op.create_index("ix_evaluation_cases_space", "evaluation_cases", ["space_id"])

    op.create_table(
        "evaluation_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("suite_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target", sa.String(length=20), nullable=False, server_default="published"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
        sa.Column("total_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suite_id"], ["evaluation_suites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evaluation_runs_space_started", "evaluation_runs", ["space_id", "started_at"])
    op.create_index("ix_evaluation_runs_suite_started", "evaluation_runs", ["suite_id", "started_at"])

    op.create_table(
        "evaluation_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("checks", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("failures", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("actual_response", sa.Text(), nullable=False),
        sa.Column("actual_agent", sa.String(length=120), nullable=True),
        sa.Column("actual_source_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("actual_rag_hit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("actual_escalated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("response_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["case_id"], ["evaluation_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["evaluation_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evaluation_results_run", "evaluation_results", ["run_id"])
    op.create_index("ix_evaluation_results_case_created", "evaluation_results", ["case_id", "created_at"])
    op.create_index("ix_evaluation_results_space", "evaluation_results", ["space_id"])


def downgrade():
    op.drop_index("ix_evaluation_results_space", table_name="evaluation_results")
    op.drop_index("ix_evaluation_results_case_created", table_name="evaluation_results")
    op.drop_index("ix_evaluation_results_run", table_name="evaluation_results")
    op.drop_table("evaluation_results")
    op.drop_index("ix_evaluation_runs_suite_started", table_name="evaluation_runs")
    op.drop_index("ix_evaluation_runs_space_started", table_name="evaluation_runs")
    op.drop_table("evaluation_runs")
    op.drop_index("ix_evaluation_cases_space", table_name="evaluation_cases")
    op.drop_index("ix_evaluation_cases_suite_created", table_name="evaluation_cases")
    op.drop_table("evaluation_cases")
    op.drop_index("ix_evaluation_suites_chatbot", table_name="evaluation_suites")
    op.drop_index("ix_evaluation_suites_space_created", table_name="evaluation_suites")
    op.drop_table("evaluation_suites")

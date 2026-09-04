"""ai_usage_events — per-call AI usage/cost tracking

Every LLM/embedding/rerank call records one row: who paid (space), what for
(kind + linkage), which model, how many tokens, estimated cost.

Revision ID: 0054_ai_usage_events
Revises: 0050_datasource_feature_control
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0054_ai_usage_events"
down_revision = "0050_datasource_feature_control"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("space_id", UUID(as_uuid=True),
                  sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("chatbot_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("kb_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("session_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("message_id", UUID(as_uuid=True), nullable=True),
        # chat | embedding | rerank | ingestion | evaluation | suggestion | assignment
        sa.Column("kind", sa.String(30), nullable=False, index=True),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("prompt_tokens", sa.Integer, nullable=True),
        sa.Column("completion_tokens", sa.Integer, nullable=True),
        sa.Column("total_tokens", sa.Integer, nullable=True),
        sa.Column("estimated", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("ok", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("error_type", sa.String(120), nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False, index=True),
    )
    op.create_index("ix_ai_usage_space_created", "ai_usage_events", ["space_id", "created_at"])


def downgrade() -> None:
    op.drop_table("ai_usage_events")

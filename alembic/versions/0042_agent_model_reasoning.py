"""Add per-entity LLM model + reasoning_effort overrides

Revision ID: 0042_agent_model_reasoning
Revises: 0041_message_thoughts
Create Date: 2026-08-07

Adds llm_model + reasoning_effort columns to the three entities that shape
what model answers a customer:

  chatbots                     — chatbot-level default (applies to every agent)
  custom_agents                — per-custom-agent override
  space_builtin_agent_configs  — per-builtin-agent override

NULL = inherit (chatbot default, or env config when the chatbot has none).
reasoning_effort is one of: "" (off), low | medium | high (see
LLMFactory.build — the empty string means the model runs without a
reasoning_effort, i.e. no chain-of-thought). llm_model is a provider-prefixed
OpenRouter-style model id (e.g. "openai/gpt-4o-mini", "deepseek/deepseek-reasoner").

Existing rows are left NULL — an existing chatbot keeps today's env-driven
model and default (no) reasoning behaviour until explicitly configured.
"""
from alembic import op
import sqlalchemy as sa

revision = "0042_agent_model_reasoning"
down_revision = "0041_message_thoughts"
branch_labels = None
depends_on = None

_TABLES = (
    "chatbots",
    "custom_agents",
    "space_builtin_agent_configs",
)


def upgrade():
    for table in _TABLES:
        op.add_column(table, sa.Column("llm_model", sa.String(120), nullable=True))
        op.add_column(table, sa.Column("reasoning_effort", sa.String(20), nullable=True))


def downgrade():
    for table in reversed(_TABLES):
        op.drop_column(table, "reasoning_effort")
        op.drop_column(table, "llm_model")

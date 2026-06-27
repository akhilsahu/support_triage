"""Drop deprecated agent_definitions table

Revision ID: 0009_drop_agent_definitions
Revises: 0008_agent_def_cols
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_drop_agent_definitions"
down_revision = "0008_agent_def_cols"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT to_regclass('agent_definitions')"))
    if result.scalar():
        conn.execute(sa.text("DROP TABLE agent_definitions CASCADE"))


def downgrade():
    pass  # not restoring deprecated table

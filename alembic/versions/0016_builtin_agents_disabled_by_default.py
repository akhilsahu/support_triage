"""set platform_enabled=false for all builtin agents by default (except triage)

Super admin must explicitly enable each built-in agent type before it appears
in org dashboards and agent panels.

Revision ID: 0016_builtin_agents_disabled_by_default
Revises: 0015_add_platform_enabled
Create Date: 2026-05-17
"""
from alembic import op

revision = '0016_builtin_agents_disabled_by_default'
down_revision = '0015_add_platform_enabled'
branch_labels = None
depends_on = None


def upgrade():
    # Disable all built-in agents except triage (triage is always required)
    op.execute("""
        UPDATE agent_definitions
        SET platform_enabled = false
        WHERE is_builtin = true
          AND slug != 'triage'
    """)


def downgrade():
    op.execute("""
        UPDATE agent_definitions
        SET platform_enabled = true
        WHERE is_builtin = true
    """)

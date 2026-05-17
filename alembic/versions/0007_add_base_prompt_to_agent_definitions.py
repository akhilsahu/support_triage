"""add base_prompt to agent_definitions

Revision ID: 0007_add_base_prompt_to_agent_definitions
Revises: 0006_add_method_and_body_to_datasource
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa

revision = '0007_add_base_prompt_to_agent_definitions'
down_revision = '0006_add_method_and_body_to_datasource'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('agent_definitions', sa.Column('base_prompt', sa.Text(), server_default=''))


def downgrade() -> None:
    op.drop_column('agent_definitions', 'base_prompt')

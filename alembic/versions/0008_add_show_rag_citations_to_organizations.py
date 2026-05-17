"""add show_rag_citations to organizations

Revision ID: 0008_add_show_rag_citations
Revises: 0007_add_base_prompt_to_agent_definitions
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = '0008_add_show_rag_citations'
down_revision = '0007_add_base_prompt_to_agent_definitions'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'organizations',
        sa.Column('show_rag_citations', sa.Boolean(), server_default='false', nullable=False),
    )


def downgrade():
    op.drop_column('organizations', 'show_rag_citations')

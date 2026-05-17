"""add doc_id to agent_meta_suggestions

Revision ID: 0010_add_doc_id_key_to_agent_meta_suggestions
Revises: 0009_add_agent_meta_suggestions
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = '0010_add_doc_id_key_to_agent_meta_suggestions'
down_revision = '0009_add_agent_meta_suggestions'
branch_labels = None
depends_on = None


def upgrade():
    # Add doc_id column (empty string = type-only suggestion, not tied to a specific doc)
    op.add_column(
        'agent_meta_suggestions',
        sa.Column('doc_id', sa.String(500), server_default='', nullable=False),
    )

    # Drop old unique index (org_id, doc_type_key)
    op.drop_index('ix_agent_meta_suggestion_org_key', table_name='agent_meta_suggestions')

    # New unique index: one cache entry per (org_id, doc_id, doc_type_key)
    op.create_index(
        'ix_agent_meta_suggestion_org_doc_type',
        'agent_meta_suggestions',
        ['org_id', 'doc_id', 'doc_type_key'],
        unique=True,
    )


def downgrade():
    op.drop_index('ix_agent_meta_suggestion_org_doc_type', table_name='agent_meta_suggestions')
    op.create_index(
        'ix_agent_meta_suggestion_org_key',
        'agent_meta_suggestions',
        ['org_id', 'doc_type_key'],
        unique=True,
    )
    op.drop_column('agent_meta_suggestions', 'doc_id')

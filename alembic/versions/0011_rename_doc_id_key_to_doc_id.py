"""rename doc_id_key to doc_id in agent_meta_suggestions

Revision ID: 0011_rename_doc_id_key_to_doc_id
Revises: 0010_add_doc_id_key_to_agent_meta_suggestions
Create Date: 2026-05-16
"""
from alembic import op

revision = '0011_rename_doc_id_key_to_doc_id'
down_revision = '0010_add_doc_id_key_to_agent_meta_suggestions'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index('ix_agent_meta_suggestion_org_doc_type', table_name='agent_meta_suggestions')
    op.alter_column('agent_meta_suggestions', 'doc_id_key', new_column_name='doc_id')
    op.create_index(
        'ix_agent_meta_suggestion_org_doc_type',
        'agent_meta_suggestions',
        ['org_id', 'doc_id', 'doc_type_key'],
        unique=True,
    )


def downgrade():
    op.drop_index('ix_agent_meta_suggestion_org_doc_type', table_name='agent_meta_suggestions')
    op.alter_column('agent_meta_suggestions', 'doc_id', new_column_name='doc_id_key')
    op.create_index(
        'ix_agent_meta_suggestion_org_doc_type',
        'agent_meta_suggestions',
        ['org_id', 'doc_id_key', 'doc_type_key'],
        unique=True,
    )

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
    # no-op: 0010 already added the column as 'doc_id' directly
    pass


def downgrade():
    pass

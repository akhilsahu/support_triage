"""add agent_doc_links junction table

Revision ID: 0012_add_agent_doc_links
Revises: 0011_rename_doc_id_key_to_doc_id
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0012_add_agent_doc_links'
down_revision = '0011_rename_doc_id_key_to_doc_id'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'agent_doc_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('agent_id', UUID(as_uuid=True),
                  sa.ForeignKey('agent_definitions.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        # doc_id is the ChromaDB document ID — no FK, doc lives in vector store
        sa.Column('doc_id', sa.String(500), nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('agent_id', 'doc_id', name='uq_agent_doc_link'),
    )


def downgrade():
    op.drop_table('agent_doc_links')

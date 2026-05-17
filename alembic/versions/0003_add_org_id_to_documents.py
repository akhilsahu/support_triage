"""add org_id to documents

Revision ID: 0003_add_org_id_to_documents
Revises: 0002_brand_tables
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa

revision = '0003_add_org_id_to_documents'
down_revision = '0002_brand_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column('org_id', sa.UUID(), nullable=True)
    )
    op.create_foreign_key(
        'fk_documents_org_id',
        'documents', 'organizations',
        ['org_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_documents_org_id', 'documents', ['org_id'])


def downgrade() -> None:
    op.drop_index('ix_documents_org_id', table_name='documents')
    op.drop_constraint('fk_documents_org_id', 'documents', type_='foreignkey')
    op.drop_column('documents', 'org_id')

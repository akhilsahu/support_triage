"""add agent_meta_suggestions table

Revision ID: 0009_add_agent_meta_suggestions
Revises: 0008_add_show_rag_citations
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0009_add_agent_meta_suggestions'
down_revision = '0008_add_show_rag_citations'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'agent_meta_suggestions',
        sa.Column('id',            postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id',        postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('agent_id',      postgresql.UUID(as_uuid=True), sa.ForeignKey('agent_definitions.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('doc_type_key',  sa.String(500), nullable=False),   # sorted, comma-joined doc_types
        sa.Column('name',          sa.String(200), nullable=False),
        sa.Column('description',   sa.Text(), server_default=''),
        sa.Column('system_prompt', sa.Text(), server_default=''),
        sa.Column('created_at',    sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at',    sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(
        'ix_agent_meta_suggestion_org_key',
        'agent_meta_suggestions',
        ['org_id', 'doc_type_key'],
        unique=True,
    )


def downgrade():
    op.drop_index('ix_agent_meta_suggestion_org_key', table_name='agent_meta_suggestions')
    op.drop_table('agent_meta_suggestions')

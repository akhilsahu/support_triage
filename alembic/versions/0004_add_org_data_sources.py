"""add org_data_sources table

Revision ID: 0004_add_org_data_sources
Revises: 0003_add_org_id_to_documents
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa

revision = '0004_add_org_data_sources'
down_revision = '0003_add_org_id_to_documents'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'org_data_sources',
        sa.Column('id',                 sa.UUID(),          primary_key=True),
        sa.Column('org_id',             sa.UUID(),          nullable=False),
        sa.Column('name',               sa.String(200),     nullable=False),
        sa.Column('agent_type',         sa.String(80),      nullable=False),
        sa.Column('api_url',            sa.String(1000),    nullable=False),
        sa.Column('auth_type',          sa.String(20),      server_default='none'),
        sa.Column('auth_value',         sa.Text(),          server_default=''),
        sa.Column('auth_header',        sa.String(100),     server_default='Authorization'),
        sa.Column('field_mapping_json', sa.Text(),          server_default='{}'),
        sa.Column('sample_response',    sa.Text(),          server_default=''),
        sa.Column('active',             sa.Boolean(),       nullable=False, server_default='true'),
        sa.Column('created_at',         sa.DateTime(),      nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',         sa.DateTime(),      server_default=sa.func.now()),
    )
    op.create_foreign_key(
        'fk_org_data_sources_org_id',
        'org_data_sources', 'organizations',
        ['org_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_org_data_source_org_id',    'org_data_sources', ['org_id'])
    op.create_index('ix_org_data_source_org_agent', 'org_data_sources', ['org_id', 'agent_type'])


def downgrade() -> None:
    op.drop_index('ix_org_data_source_org_agent', table_name='org_data_sources')
    op.drop_index('ix_org_data_source_org_id',    table_name='org_data_sources')
    op.drop_constraint('fk_org_data_sources_org_id', 'org_data_sources', type_='foreignkey')
    op.drop_table('org_data_sources')

"""add request_headers and request_params to org_data_sources

Revision ID: 0005_add_datasource_request_fields
Revises: 0004_add_org_data_sources
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa

revision = '0005_add_datasource_request_fields'
down_revision = '0004_add_org_data_sources'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('org_data_sources', sa.Column('request_headers_json', sa.Text(), server_default='{}'))
    op.add_column('org_data_sources', sa.Column('request_params_json',  sa.Text(), server_default='{}'))


def downgrade() -> None:
    op.drop_column('org_data_sources', 'request_params_json')
    op.drop_column('org_data_sources', 'request_headers_json')

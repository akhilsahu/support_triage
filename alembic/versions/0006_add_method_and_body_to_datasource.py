"""add method and request_body_json to org_data_sources

Revision ID: 0006_add_method_and_body_to_datasource
Revises: 0005_add_datasource_request_fields
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa

revision = '0006_add_method_and_body_to_datasource'
down_revision = '0005_add_datasource_request_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('org_data_sources', sa.Column('method', sa.String(10), server_default='GET'))
    op.add_column('org_data_sources', sa.Column('request_body_json', sa.Text(), server_default='{}'))


def downgrade() -> None:
    op.drop_column('org_data_sources', 'request_body_json')
    op.drop_column('org_data_sources', 'method')

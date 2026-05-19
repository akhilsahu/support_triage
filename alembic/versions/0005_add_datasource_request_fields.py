"""no-op (squashed into 19fd7781d00f)

Revision ID: 0005_add_datasource_request_fields
Revises: 0004_add_org_data_sources
"""
from typing import Sequence, Union
revision: str = '0005_add_datasource_request_fields'
down_revision: Union[str, None] = '0004_add_org_data_sources'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

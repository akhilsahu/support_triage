"""no-op (squashed into 19fd7781d00f)

Revision ID: 0006_add_method_and_body_to_datasource
Revises: 0005_add_datasource_request_fields
"""
from typing import Sequence, Union
revision: str = '0006_add_method_and_body_to_datasource'
down_revision: Union[str, None] = '0005_add_datasource_request_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

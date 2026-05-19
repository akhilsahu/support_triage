"""no-op (squashed into 19fd7781d00f)

Revision ID: 0002_brand_tables
Revises: 19fd7781d00f
"""
from typing import Sequence, Union
revision: str = '0002_brand_tables'
down_revision: Union[str, None] = '19fd7781d00f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

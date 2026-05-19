"""no-op (squashed into 19fd7781d00f)

Revision ID: 0003_add_org_id_to_documents
Revises: 0002_brand_tables
"""
from typing import Sequence, Union
revision: str = '0003_add_org_id_to_documents'
down_revision: Union[str, None] = '0002_brand_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

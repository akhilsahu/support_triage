"""no-op (squashed into 19fd7781d00f)

Revision ID: 0004_add_org_data_sources
Revises: 0003_add_org_id_to_documents
"""
from typing import Sequence, Union
revision: str = '0004_add_org_data_sources'
down_revision: Union[str, None] = '0003_add_org_id_to_documents'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

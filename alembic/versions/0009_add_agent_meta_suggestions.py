"""no-op (squashed into 19fd7781d00f)

Revision ID: 0009_add_agent_meta_suggestions
Revises: 0008_add_show_rag_citations
"""
from typing import Sequence, Union
revision: str = '0009_add_agent_meta_suggestions'
down_revision: Union[str, None] = '0008_add_show_rag_citations'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

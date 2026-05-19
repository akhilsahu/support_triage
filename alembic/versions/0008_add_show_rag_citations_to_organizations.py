"""no-op (squashed into 19fd7781d00f)

Revision ID: 0008_add_show_rag_citations
Revises: 0007_add_base_prompt_to_agent_definitions
"""
from typing import Sequence, Union
revision: str = '0008_add_show_rag_citations'
down_revision: Union[str, None] = '0007_add_base_prompt_to_agent_definitions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

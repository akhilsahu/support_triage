"""no-op (squashed into 19fd7781d00f)

Revision ID: 0013_add_chat_sessions
Revises: 0012_add_agent_doc_links
"""
from typing import Sequence, Union
revision: str = '0013_add_chat_sessions'
down_revision: Union[str, None] = '0012_add_agent_doc_links'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

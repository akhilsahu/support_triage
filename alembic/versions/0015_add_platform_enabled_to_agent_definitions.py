"""no-op (squashed into 19fd7781d00f)

Revision ID: 0015_add_platform_enabled
Revises: 0014_drop_session_id_from_chat_sessions
"""
from typing import Sequence, Union
revision: str = '0015_add_platform_enabled'
down_revision: Union[str, None] = '0014_drop_session_id_from_chat_sessions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

"""no-op (squashed into 19fd7781d00f)

Revision ID: 0017_add_chatbots
Revises: 0016_builtin_agents_disabled_by_default
"""
from typing import Sequence, Union
revision: str = '0017_add_chatbots'
down_revision: Union[str, None] = '0016_builtin_agents_disabled_by_default'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

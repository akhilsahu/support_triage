"""no-op (squashed into 19fd7781d00f)

Revision ID: 0016_builtin_agents_disabled_by_default
Revises: 0015_add_platform_enabled
"""
from typing import Sequence, Union
revision: str = '0016_builtin_agents_disabled_by_default'
down_revision: Union[str, None] = '0015_add_platform_enabled'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

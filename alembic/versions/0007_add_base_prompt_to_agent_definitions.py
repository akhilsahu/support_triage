"""no-op (squashed into 19fd7781d00f)

Revision ID: 0007_add_base_prompt_to_agent_definitions
Revises: 0006_add_method_and_body_to_datasource
"""
from typing import Sequence, Union
revision: str = '0007_add_base_prompt_to_agent_definitions'
down_revision: Union[str, None] = '0006_add_method_and_body_to_datasource'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass

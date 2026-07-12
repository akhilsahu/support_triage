"""fix missing columns placeholder

Revision ID: 0019_fix_missing_columns
Revises: 0018_agent_meta_suggestions
Create Date: 2026-06-28 01:20:54.633687

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0019_fix_missing_columns'
down_revision: Union[str, None] = '0018_agent_meta_suggestions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

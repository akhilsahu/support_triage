"""Remove evaluation tables

Revision ID: b61d331fc6f3
Revises: 552668d8697c
Create Date: 2026-09-20 19:50:18.587051

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b61d331fc6f3'
down_revision: Union[str, None] = '552668d8697c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("evaluation_results")
    op.drop_table("evaluation_runs")
    op.drop_table("evaluation_cases")
    op.drop_table("evaluation_suites")


def downgrade() -> None:
    pass

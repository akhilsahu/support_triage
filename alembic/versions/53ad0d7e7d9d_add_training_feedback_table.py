"""Add training_feedback table

Revision ID: 53ad0d7e7d9d
Revises: 6fea89a295d8
Create Date: 2026-08-25 23:40:53.332306

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '53ad0d7e7d9d'
down_revision: Union[str, None] = '6fea89a295d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('training_feedback',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('original_subjects', sa.JSON(), nullable=False),
    sa.Column('corrected_hierarchy', sa.JSON(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('training_feedback')

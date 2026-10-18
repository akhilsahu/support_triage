"""widen_ingestion_jobs_status_to_50

Revision ID: bc9e0d87ae89
Revises: 6a9b857816d7
Create Date: 2026-10-18 21:30:50.912024

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bc9e0d87ae89'
down_revision: Union[str, None] = '6a9b857816d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('ingestion_jobs', 'status',
                    existing_type=sa.String(length=20),
                    type_=sa.String(length=50),
                    existing_nullable=False)


def downgrade() -> None:
    op.alter_column('ingestion_jobs', 'status',
                    existing_type=sa.String(length=50),
                    type_=sa.String(length=20),
                    existing_nullable=False)

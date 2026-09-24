"""add_yullo_config

Revision ID: 0c199ce9abc9
Revises: a230baaa0ab5
Create Date: 2026-09-18 18:27:06.917598

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0c199ce9abc9'
down_revision: Union[str, None] = 'a230baaa0ab5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('yullo_configs',
    sa.Column('space_id', sa.UUID(), nullable=False),
    sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('space_id')
    )

def downgrade() -> None:
    op.drop_table('yullo_configs')

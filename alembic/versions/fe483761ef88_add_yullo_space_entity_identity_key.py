"""add_yullo_space_entity_identity_key

Revision ID: fe483761ef88
Revises: b61d331fc6f3
Create Date: 2026-09-20 20:54:02.737269

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fe483761ef88'
down_revision: Union[str, None] = 'b61d331fc6f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column as nullable
    op.add_column('yullo_space_entities', sa.Column('identity_key', sa.String(length=200), nullable=True))
    
    # 2. Backfill existing rows with their uuid id cast to string
    op.execute("UPDATE yullo_space_entities SET identity_key = id::text WHERE identity_key IS NULL")
    
    # 3. Apply unique constraint
    op.create_unique_constraint('uq_yullo_space_entity_identity', 'yullo_space_entities', ['space_id', 'entity_type', 'identity_key'])
    
    # 4. Make column non-nullable
    op.alter_column('yullo_space_entities', 'identity_key', nullable=False)


def downgrade() -> None:
    op.drop_constraint('uq_yullo_space_entity_identity', 'yullo_space_entities', type_='unique')
    op.drop_column('yullo_space_entities', 'identity_key')

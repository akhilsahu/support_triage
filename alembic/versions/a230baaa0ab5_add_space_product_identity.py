"""add_space_product_identity

Revision ID: a230baaa0ab5
Revises: 409cedac91a9
Create Date: 2026-09-18 18:22:00.449156

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a230baaa0ab5'
down_revision: Union[str, None] = '409cedac91a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add product column as nullable first
    op.add_column('spaces', sa.Column('product', sa.String(length=20), nullable=True))
    
    # Deterministic backfill
    op.execute("UPDATE spaces SET product = 'support247' WHERE product IS NULL")
    
    # Make product non-nullable
    op.alter_column('spaces', 'product', existing_type=sa.String(length=20), nullable=False)
    
    # Add check constraint
    op.create_check_constraint('ck_spaces_product', 'spaces', "product IN ('support247', 'yullo')")
    
    # Drop global unique constraint on slug and add index
    op.drop_index('ix_spaces_slug', table_name='spaces')
    op.create_index(op.f('ix_spaces_slug'), 'spaces', ['slug'], unique=False)
    
    # Add composite unique constraint
    op.create_unique_constraint('uq_space_product_slug', 'spaces', ['product', 'slug'])


def downgrade() -> None:
    # Drop constraints and product column
    op.drop_constraint('uq_space_product_slug', 'spaces', type_='unique')
    op.drop_constraint('ck_spaces_product', 'spaces', type_='check')
    
    op.drop_index(op.f('ix_spaces_slug'), table_name='spaces')
    op.create_index('ix_spaces_slug', 'spaces', ['slug'], unique=True)
    
    op.drop_column('spaces', 'product')

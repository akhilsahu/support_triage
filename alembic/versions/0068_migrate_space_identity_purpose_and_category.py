"""Migrate space identity purpose and subtype to category

Revision ID: 0068_migrate_space_identity_purpose_and_category
Revises: fe483761ef88
Create Date: 2026-09-25 01:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0068_identity_purpose_category'
down_revision = '44b11fc62848'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Update spaces.purpose: 'personal' -> 'person', 'work' -> 'creator'
    op.execute("UPDATE spaces SET purpose = 'person' WHERE purpose = 'personal'")
    op.execute("UPDATE spaces SET purpose = 'creator' WHERE purpose = 'work'")
    
    # 2. Update yullo_spaces.purpose: 'personal' -> 'person', 'work' -> 'creator'
    op.execute("UPDATE yullo_spaces SET purpose = 'person' WHERE purpose = 'personal'")
    op.execute("UPDATE yullo_spaces SET purpose = 'creator' WHERE purpose = 'work'")
    
    # 3. Migrate yullo_configs.settings identity.subtype to identity.category
    op.execute("""
        UPDATE yullo_configs
        SET settings = jsonb_set(
            settings - 'identity',
            '{identity}',
            (
                (settings->'identity') - 'subtype' || 
                jsonb_build_object('category', settings->'identity'->'subtype')
            )
        )
        WHERE settings->'identity' ? 'subtype'
          AND NOT (settings->'identity' ? 'category');
    """)

def downgrade() -> None:
    op.execute("UPDATE spaces SET purpose = 'personal' WHERE purpose = 'person'")
    op.execute("UPDATE spaces SET purpose = 'work' WHERE purpose = 'creator'")
    op.execute("UPDATE yullo_spaces SET purpose = 'personal' WHERE purpose = 'person'")
    op.execute("UPDATE yullo_spaces SET purpose = 'work' WHERE purpose = 'creator'")

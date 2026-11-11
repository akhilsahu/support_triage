"""Alter logo_url column to Text in spaces and chatbots tables

Revision ID: 0069_alter_logo_url_to_text
Revises: 0068_identity_purpose_category
Create Date: 2026-09-25 23:20:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '0069_alter_logo_url_to_text'
down_revision = '26d5190864a1'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.alter_column('spaces', 'logo_url', type_=sa.Text(), existing_type=sa.String(length=500), nullable=True)
    op.alter_column('chatbots', 'logo_url', type_=sa.Text(), existing_type=sa.String(length=500), nullable=True)

def downgrade() -> None:
    op.alter_column('spaces', 'logo_url', type_=sa.String(length=500), existing_type=sa.Text(), nullable=True)
    op.alter_column('chatbots', 'logo_url', type_=sa.String(length=500), existing_type=sa.Text(), nullable=True)

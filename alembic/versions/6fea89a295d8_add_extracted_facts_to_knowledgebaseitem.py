"""Add extracted_facts to KnowledgeBaseItem

Revision ID: 6fea89a295d8
Revises: 0042_agent_model_reasoning
Create Date: 2026-08-16 14:11:08.528373

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '6fea89a295d8'
down_revision = '0042_agent_model_reasoning'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('knowledge_base_items', sa.Column('extracted_facts', sa.JSON(), nullable=True))

def downgrade():
    op.drop_column('knowledge_base_items', 'extracted_facts')

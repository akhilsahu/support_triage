"""Store source-revision link and image destinations without a data backfill."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f1a2b3c4d5e6'
down_revision = 'e6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'knowledge_source_assets',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('space_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_kb_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('url_hash', sa.String(64), nullable=False),
        sa.Column('metadata_json', postgresql.JSONB(), nullable=False),
        sa.ForeignKeyConstraint(
            ['source_item_id', 'space_id', 'source_kb_id'],
            ['knowledge_base_items.id', 'knowledge_base_items.space_id', 'knowledge_base_items.kb_id'],
            ondelete='CASCADE', name='fk_source_asset_source',
        ),
        sa.UniqueConstraint('space_id', 'source_item_id', 'source_version', 'kind', 'url_hash',
                            name='uq_source_asset_destination'),
        sa.CheckConstraint("kind IN ('link', 'image')", name='ck_source_asset_kind'),
        sa.CheckConstraint('source_version > 0', name='ck_source_asset_version'),
    )
    op.create_index('ix_source_assets_revision', 'knowledge_source_assets',
                    ['space_id', 'source_item_id', 'source_version'])


def downgrade():
    op.drop_table('knowledge_source_assets')

"""Deduplicated destinations belonging to one knowledge source revision."""
from sqlalchemy import Column, String, Text, Integer, ForeignKeyConstraint, UniqueConstraint, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base


class KnowledgeSourceAsset(Base):
    __tablename__ = 'knowledge_source_assets'

    id = Column(String(64), primary_key=True)
    space_id = Column(UUID(as_uuid=True), nullable=False)
    source_item_id = Column(UUID(as_uuid=True), nullable=False)
    source_kb_id = Column(UUID(as_uuid=True), nullable=False)
    source_version = Column(Integer, nullable=False)
    kind = Column(String(10), nullable=False)
    url = Column(Text, nullable=False)
    url_hash = Column(String(64), nullable=False)
    metadata_json = Column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        ForeignKeyConstraint(
            ['source_item_id', 'space_id', 'source_kb_id'],
            ['knowledge_base_items.id', 'knowledge_base_items.space_id', 'knowledge_base_items.kb_id'],
            ondelete='CASCADE', name='fk_source_asset_source',
        ),
        UniqueConstraint('space_id', 'source_item_id', 'source_version', 'kind', 'url_hash',
                         name='uq_source_asset_destination'),
        CheckConstraint("kind IN ('link', 'image')", name='ck_source_asset_kind'),
        CheckConstraint('source_version > 0', name='ck_source_asset_version'),
        Index('ix_source_assets_revision', 'space_id', 'source_item_id', 'source_version'),
    )

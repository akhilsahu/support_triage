import uuid
from datetime import datetime

from sqlalchemy import Column, String, ForeignKey, DateTime, Integer, Boolean, Index, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.core.database import Base


class YulloSpaceEntity(Base):
    """
    Authoritative structured Generative UI entity for a Yullo Space.
    Replaces the provisional YulloResource.
    """
    __tablename__ = "yullo_space_entities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(UUID(as_uuid=True), ForeignKey("yullo_spaces.space_id", ondelete="CASCADE"), nullable=False)
    
    identity_key = Column(String(200), nullable=False)
    
    entity_type = Column(String(50), nullable=False)
    origin_type = Column(String(50), nullable=False)
    review_status = Column(String(50), nullable=False)
    revision = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    payload_json = Column(JSON, nullable=False)
    schema_version = Column(Integer, default=1, nullable=False)
    
    visibility = Column(String(50), nullable=True)
    disclosure_mode = Column(String(50), nullable=True)
    field_policies = Column(JSON, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    space = relationship("Space", primaryjoin="YulloSpaceEntity.space_id == Space.id", foreign_keys=[space_id])
    evidence = relationship("YulloSpaceEntityEvidence", back_populates="entity", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_yullo_space_entities_space_id", space_id),
        UniqueConstraint("id", "space_id", name="uq_yullo_space_entity_id_space"),
        UniqueConstraint("space_id", "entity_type", "identity_key", name="uq_yullo_space_entity_identity"),
    )


class YulloSpaceEntityEvidence(Base):
    """
    Provenance records linking entities to the authoritative knowledge base items
    that justify their existence.
    """
    __tablename__ = "yullo_space_entity_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    source_item_id = Column(UUID(as_uuid=True), nullable=False)
    source_kb_id = Column(UUID(as_uuid=True), nullable=False)
    source_version = Column(Integer, nullable=False)
    locator_metadata = Column(JSON, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    entity = relationship("YulloSpaceEntity", back_populates="evidence")

    # In PostgreSQL, we have a composite foreign key to knowledge_base_items.
    __table_args__ = (
        Index("ix_yullo_space_entity_evidence_entity_id", entity_id),
        ForeignKeyConstraint(
            ['entity_id', 'space_id'],
            ['yullo_space_entities.id', 'yullo_space_entities.space_id'],
            name='fk_evidence_entity',
            ondelete='CASCADE'
        ),
        ForeignKeyConstraint(
            ['source_item_id', 'space_id', 'source_kb_id'],
            ['knowledge_base_items.id', 'knowledge_base_items.space_id', 'knowledge_base_items.kb_id'],
            name='fk_evidence_kb_item',
            ondelete='CASCADE'
        ),
    )

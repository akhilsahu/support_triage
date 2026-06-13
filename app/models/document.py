"""Document model with vector embeddings for RAG"""

from sqlalchemy import Column, String, Text, Integer, DateTime, JSON, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from datetime import datetime
import uuid
from app.core.database import Base


class Document(Base):
    """
    Document model with vector embeddings for semantic search.

    Supports RAG (Retrieval-Augmented Generation) by storing document chunks
    with their vector embeddings for similarity search using pgvector.
    """

    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    doc_metadata = Column(JSON, default={}, nullable=False)
    embedding = Column(Vector(384), nullable=True)  # Dimension matches embedding model
    source = Column(String(500), nullable=False)
    chunk_index = Column(Integer, default=0, nullable=False)
    parent_document_id = Column(UUID(as_uuid=True), nullable=True)
    document_type = Column(String(50), default="text")
    language = Column(String(10), default="en")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    space = relationship("Space", back_populates="documents")

    # Create vector index for efficient similarity search
    __table_args__ = (
        Index(
            'ix_documents_embedding',
            'embedding',
            postgresql_using='ivfflat',
            postgresql_with={'lists': 100},
            postgresql_ops={'embedding': 'vector_cosine_ops'}
        ),
        Index('ix_documents_source', 'source'),
        Index('ix_documents_parent_id', 'parent_document_id'),
        Index('ix_documents_created_at', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Document(id={self.id}, source={self.source}, chunk={self.chunk_index})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": str(self.id),
            "space_id": str(self.space_id) if self.space_id else None,
            "content": self.content,
            "metadata": self.doc_metadata,
            "source": self.source,
            "chunk_index": self.chunk_index,
            "parent_document_id": str(self.parent_document_id) if self.parent_document_id else None,
            "document_type": self.document_type,
            "language": self.language,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

# Made with Bob

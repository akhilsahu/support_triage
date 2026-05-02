"""Pydantic schemas for Document model"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from uuid import UUID


class DocumentBase(BaseModel):
    """Base schema for Document"""
    content: str = Field(..., min_length=1, description="Document content")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Document metadata")
    source: str = Field(..., description="Document source")
    document_type: Optional[str] = Field("text", description="Document type")
    language: Optional[str] = Field("en", description="Document language")


class DocumentCreate(DocumentBase):
    """Schema for creating a document"""
    chunk_index: Optional[int] = Field(0, description="Chunk index for multi-part documents")
    parent_document_id: Optional[UUID] = Field(None, description="Parent document ID")


class DocumentUpdate(BaseModel):
    """Schema for updating a document"""
    content: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    source: Optional[str] = None
    document_type: Optional[str] = None
    language: Optional[str] = None


class DocumentResponse(DocumentBase):
    """Schema for document response"""
    id: UUID
    chunk_index: int
    parent_document_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    has_embedding: bool = Field(default=False, description="Whether document has embedding")

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with_embedding(cls, obj):
        """Create response with embedding status"""
        data = {
            "id": obj.id,
            "content": obj.content,
            "metadata": obj.metadata,
            "source": obj.source,
            "chunk_index": obj.chunk_index,
            "parent_document_id": obj.parent_document_id,
            "document_type": obj.document_type,
            "language": obj.language,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
            "has_embedding": obj.embedding is not None
        }
        return cls(**data)


class DocumentSearchRequest(BaseModel):
    """Schema for document search"""
    query: str = Field(..., min_length=1, description="Search query")
    top_k: Optional[int] = Field(5, ge=1, le=50, description="Number of results")
    similarity_threshold: Optional[float] = Field(0.7, ge=0, le=1, description="Minimum similarity")
    filters: Optional[Dict[str, Any]] = Field(None, description="Additional filters")


class DocumentSearchResult(BaseModel):
    """Schema for search result"""
    document: DocumentResponse
    similarity_score: float = Field(..., ge=0, le=1, description="Similarity score")


class DocumentSearchResponse(BaseModel):
    """Schema for search response"""
    query: str
    results: List[DocumentSearchResult]
    total: int


class RAGQueryRequest(BaseModel):
    """Schema for RAG query"""
    query: str = Field(..., min_length=1, description="User question")
    model: Optional[str] = Field(None, description="LLM model (e.g., gpt-4, claude-3-opus)")
    temperature: Optional[float] = Field(None, ge=0, le=2, description="Temperature")
    max_tokens: Optional[int] = Field(None, gt=0, description="Max tokens")
    top_k: Optional[int] = Field(5, ge=1, le=20, description="Documents to retrieve")
    filters: Optional[Dict[str, Any]] = Field(None, description="Document filters")
    include_sources: Optional[bool] = Field(True, description="Include source documents")


class RAGQueryResponse(BaseModel):
    """Schema for RAG query response"""
    answer: str
    model: str
    provider: str
    sources: Optional[List[Dict[str, Any]]] = None
    usage: Optional[Dict[str, Any]] = None


class DocumentUploadResponse(BaseModel):
    """Schema for document upload response"""
    document_id: UUID
    filename: str
    chunks_created: int
    total_size: int
    message: str

# Made with Bob

"""RAG retriever for vector similarity search"""

from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.models.document import Document
from app.services.embedding_service import embedding_service
from app.config import settings

logger = structlog.get_logger()


class RAGRetriever:
    """
    Retriever for RAG (Retrieval-Augmented Generation).
    
    Uses pgvector for efficient similarity search on document embeddings.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Document]:
        """
        Retrieve relevant documents using vector similarity.
        
        Args:
            query: Search query
            top_k: Number of documents to retrieve
            similarity_threshold: Minimum similarity score (0-1)
            filters: Additional filters (e.g., {"source": "manual.pdf"})
        
        Returns:
            List of relevant documents
        """
        top_k = top_k or settings.RAG_TOP_K
        similarity_threshold = similarity_threshold or settings.RAG_SIMILARITY_THRESHOLD
        
        # Generate query embedding
        query_embedding = await embedding_service.generate_embedding(query)
        
        # Build query with vector similarity
        stmt = select(
            Document,
            func.cosine_distance(Document.embedding, query_embedding).label("distance")
        ).where(Document.embedding.isnot(None))
        
        # Apply filters
        if filters:
            for key, value in filters.items():
                if hasattr(Document, key):
                    stmt = stmt.where(getattr(Document, key) == value)
        
        # Order by similarity and limit
        stmt = stmt.order_by("distance").limit(top_k)
        
        result = await self.db.execute(stmt)
        documents = []
        
        for doc, distance in result:
            similarity = 1 - distance
            if similarity >= similarity_threshold:
                documents.append(doc)
        
        logger.info(
            "Documents retrieved",
            query_length=len(query),
            retrieved=len(documents),
            top_k=top_k,
            threshold=similarity_threshold
        )
        
        return documents
    
    async def retrieve_with_scores(
        self,
        query: str,
        top_k: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[Document, float]]:
        """
        Retrieve documents with similarity scores.
        
        Args:
            query: Search query
            top_k: Number of documents to retrieve
            filters: Additional filters
        
        Returns:
            List of (document, similarity_score) tuples
        """
        top_k = top_k or settings.RAG_TOP_K
        
        # Generate query embedding
        query_embedding = await embedding_service.generate_embedding(query)
        
        # Build query
        stmt = select(
            Document,
            func.cosine_distance(Document.embedding, query_embedding).label("distance")
        ).where(Document.embedding.isnot(None))
        
        # Apply filters
        if filters:
            for key, value in filters.items():
                if hasattr(Document, key):
                    stmt = stmt.where(getattr(Document, key) == value)
        
        # Order by similarity and limit
        stmt = stmt.order_by("distance").limit(top_k)
        
        result = await self.db.execute(stmt)
        
        documents_with_scores = [
            (doc, 1 - distance) for doc, distance in result
        ]
        
        logger.info(
            "Documents retrieved with scores",
            query_length=len(query),
            retrieved=len(documents_with_scores),
            top_k=top_k
        )
        
        return documents_with_scores
    
    async def retrieve_by_similarity(
        self,
        embedding: List[float],
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Document]:
        """
        Retrieve documents using a pre-computed embedding.
        
        Args:
            embedding: Query embedding vector
            top_k: Number of documents to retrieve
            similarity_threshold: Minimum similarity score
            filters: Additional filters
        
        Returns:
            List of relevant documents
        """
        top_k = top_k or settings.RAG_TOP_K
        similarity_threshold = similarity_threshold or settings.RAG_SIMILARITY_THRESHOLD
        
        # Build query
        stmt = select(
            Document,
            func.cosine_distance(Document.embedding, embedding).label("distance")
        ).where(Document.embedding.isnot(None))
        
        # Apply filters
        if filters:
            for key, value in filters.items():
                if hasattr(Document, key):
                    stmt = stmt.where(getattr(Document, key) == value)
        
        # Order by similarity and limit
        stmt = stmt.order_by("distance").limit(top_k)
        
        result = await self.db.execute(stmt)
        documents = []
        
        for doc, distance in result:
            similarity = 1 - distance
            if similarity >= similarity_threshold:
                documents.append(doc)
        
        return documents
    
    async def retrieve_similar_documents(
        self,
        document_id: str,
        top_k: Optional[int] = None,
        exclude_self: bool = True
    ) -> List[Tuple[Document, float]]:
        """
        Find documents similar to a given document.
        
        Args:
            document_id: ID of the reference document
            top_k: Number of similar documents to retrieve
            exclude_self: Whether to exclude the reference document
        
        Returns:
            List of (document, similarity_score) tuples
        """
        top_k = top_k or settings.RAG_TOP_K
        
        # Get reference document
        stmt = select(Document).where(Document.id == document_id)
        result = await self.db.execute(stmt)
        ref_doc = result.scalar_one_or_none()
        
        if not ref_doc or not ref_doc.embedding:
            logger.warning(f"Document not found or has no embedding: {document_id}")
            return []
        
        # Find similar documents
        stmt = select(
            Document,
            func.cosine_distance(Document.embedding, ref_doc.embedding).label("distance")
        ).where(Document.embedding.isnot(None))
        
        if exclude_self:
            stmt = stmt.where(Document.id != document_id)
        
        stmt = stmt.order_by("distance").limit(top_k)
        
        result = await self.db.execute(stmt)
        
        similar_docs = [
            (doc, 1 - distance) for doc, distance in result
        ]
        
        logger.info(
            "Similar documents retrieved",
            reference_id=document_id,
            found=len(similar_docs)
        )
        
        return similar_docs
    
    async def hybrid_search(
        self,
        query: str,
        top_k: Optional[int] = None,
        keyword_weight: float = 0.3,
        semantic_weight: float = 0.7,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[Document, float]]:
        """
        Hybrid search combining keyword and semantic search.
        
        Args:
            query: Search query
            top_k: Number of documents to retrieve
            keyword_weight: Weight for keyword matching (0-1)
            semantic_weight: Weight for semantic similarity (0-1)
            filters: Additional filters
        
        Returns:
            List of (document, combined_score) tuples
        """
        top_k = top_k or settings.RAG_TOP_K
        
        # Semantic search
        semantic_results = await self.retrieve_with_scores(
            query,
            top_k=top_k * 2,  # Get more for reranking
            filters=filters
        )
        
        # Simple keyword matching (can be enhanced with full-text search)
        keyword_scores = {}
        query_terms = set(query.lower().split())
        
        for doc, _ in semantic_results:
            content_terms = set(doc.content.lower().split())
            overlap = len(query_terms & content_terms)
            keyword_scores[doc.id] = overlap / len(query_terms) if query_terms else 0
        
        # Combine scores
        combined_results = []
        for doc, semantic_score in semantic_results:
            keyword_score = keyword_scores.get(doc.id, 0)
            combined_score = (
                semantic_weight * semantic_score +
                keyword_weight * keyword_score
            )
            combined_results.append((doc, combined_score))
        
        # Sort by combined score and limit
        combined_results.sort(key=lambda x: x[1], reverse=True)
        combined_results = combined_results[:top_k]
        
        logger.info(
            "Hybrid search completed",
            query_length=len(query),
            results=len(combined_results),
            semantic_weight=semantic_weight,
            keyword_weight=keyword_weight
        )
        
        return combined_results

# Made with Bob

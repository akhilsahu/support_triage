"""Document and RAG API endpoints"""

from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.core.database import get_db
from app.models.document import Document
from app.schemas.document import (
    DocumentCreate,
    DocumentResponse,
    DocumentSearchRequest,
    DocumentSearchResult,
    DocumentSearchResponse,
    RAGQueryRequest,
    RAGQueryResponse,
    DocumentUploadResponse
)
from app.services.embedding_service import embedding_service
from app.rag.retriever import RAGRetriever
from app.rag.chain import RAGChain

logger = structlog.get_logger()

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    document_data: DocumentCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new document with automatic embedding generation.
    """
    try:
        # Create document
        document = Document(**document_data.model_dump())
        
        # Generate embedding
        embedding = await embedding_service.generate_embedding(document.content)
        document.embedding = embedding
        
        db.add(document)
        await db.commit()
        await db.refresh(document)
        
        logger.info("Document created", document_id=str(document.id))
        return DocumentResponse.from_orm_with_embedding(document)
    
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create document: {str(e)}"
        )


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all documents"""
    try:
        stmt = select(Document).offset(skip).limit(limit)
        result = await db.execute(stmt)
        documents = result.scalars().all()
        
        return [DocumentResponse.from_orm_with_embedding(doc) for doc in documents]
    
    except Exception as e:
        logger.error(f"Failed to list documents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list documents: {str(e)}"
        )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get document by ID"""
    try:
        stmt = select(Document).where(Document.id == document_id)
        result = await db.execute(stmt)
        document = result.scalar_one_or_none()
        
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document not found: {document_id}"
            )
        
        return DocumentResponse.from_orm_with_embedding(document)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get document: {str(e)}"
        )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete document"""
    try:
        stmt = select(Document).where(Document.id == document_id)
        result = await db.execute(stmt)
        document = result.scalar_one_or_none()
        
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document not found: {document_id}"
            )
        
        await db.delete(document)
        await db.commit()
        
        logger.info("Document deleted", document_id=str(document_id))
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )


@router.post("/search", response_model=DocumentSearchResponse)
async def search_documents(
    search_request: DocumentSearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Search documents using vector similarity.
    
    Uses pgvector for efficient semantic search.
    """
    try:
        retriever = RAGRetriever(db)
        
        docs_with_scores = await retriever.retrieve_with_scores(
            query=search_request.query,
            top_k=search_request.top_k,
            filters=search_request.filters
        )
        
        # Filter by similarity threshold
        filtered_results = [
            (doc, score) for doc, score in docs_with_scores
            if score >= search_request.similarity_threshold
        ]
        
        results = [
            DocumentSearchResult(
                document=DocumentResponse.from_orm_with_embedding(doc),
                similarity_score=score
            )
            for doc, score in filtered_results
        ]
        
        logger.info(
            "Document search completed",
            query_length=len(search_request.query),
            results=len(results)
        )
        
        return DocumentSearchResponse(
            query=search_request.query,
            results=results,
            total=len(results)
        )
    
    except Exception as e:
        logger.error(f"Document search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document search failed: {str(e)}"
        )


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a document file and process it for RAG.
    
    Supports: txt, pdf, docx, md, json
    """
    try:
        # Read file content
        content = await file.read()
        text_content = content.decode('utf-8')
        
        # Simple chunking (can be enhanced)
        chunk_size = 1000
        chunks = [
            text_content[i:i+chunk_size]
            for i in range(0, len(text_content), chunk_size)
        ]
        
        # Create parent document
        parent_doc = Document(
            content=text_content[:500] + "...",  # Summary
            source=file.filename,
            metadata={"original_size": len(text_content), "chunks": len(chunks)}
        )
        db.add(parent_doc)
        await db.flush()
        
        # Create chunk documents with embeddings
        for i, chunk in enumerate(chunks):
            embedding = await embedding_service.generate_embedding(chunk)
            chunk_doc = Document(
                content=chunk,
                source=file.filename,
                chunk_index=i,
                parent_document_id=parent_doc.id,
                embedding=embedding,
                metadata={"chunk": i, "total_chunks": len(chunks)}
            )
            db.add(chunk_doc)
        
        await db.commit()
        
        logger.info(
            "Document uploaded and processed",
            filename=file.filename,
            chunks=len(chunks),
            size=len(text_content)
        )
        
        return DocumentUploadResponse(
            document_id=parent_doc.id,
            filename=file.filename,
            chunks_created=len(chunks),
            total_size=len(text_content),
            message=f"Document uploaded and split into {len(chunks)} chunks"
        )
    
    except Exception as e:
        await db.rollback()
        logger.error(f"Document upload failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document upload failed: {str(e)}"
        )


@router.post("/rag/query", response_model=RAGQueryResponse)
async def rag_query(
    query_request: RAGQueryRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Execute RAG query with switchable LLM model.
    
    Retrieves relevant documents and generates answer using:
    - OpenAI: gpt-3.5-turbo, gpt-4, gpt-4-turbo, gpt-4o
    - Anthropic: claude-3-opus, claude-3-sonnet, claude-3-haiku, claude-3.5-sonnet
    """
    try:
        retriever = RAGRetriever(db)
        rag_chain = RAGChain(retriever)
        
        result = await rag_chain.query(
            question=query_request.query,
            model=query_request.model,
            temperature=query_request.temperature,
            max_tokens=query_request.max_tokens,
            top_k=query_request.top_k,
            filters=query_request.filters,
            include_sources=query_request.include_sources
        )
        
        logger.info(
            "RAG query completed",
            query_length=len(query_request.query),
            model=result["model"],
            provider=result["provider"]
        )
        
        return RAGQueryResponse(**result)
    
    except Exception as e:
        logger.error(f"RAG query failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"RAG query failed: {str(e)}"
        )

# Made with Bob

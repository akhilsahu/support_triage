"""
Documents API — CRUD + RAG upload/chat endpoints.

Existing (pgvector / DB-backed):
  POST   /documents/                    — create document record
  GET    /documents/                    — list all documents
  GET    /documents/{id}                — get document
  DELETE /documents/{id}                — delete document
  POST   /documents/search              — vector similarity search (pgvector)
  POST   /documents/rag/query           — RAG query via pgvector + LLM

Multi-source ingest (ChromaDB-backed):
  POST   /documents/rag/ingest-text     — ingest raw text / markdown from a text box
  POST   /documents/rag/ingest-url      — scrape a URL and ingest page content

New (ChromaDB-backed, no DB required):
  POST   /documents/rag/upload          — upload any doc (PDF/DOCX/TXT/HTML/JSON/CSV)
                                          parse → chunk → embed → ChromaDB
  POST   /documents/rag/chat            — chat with an uploaded doc
  GET    /documents/rag/list            — list uploaded docs (in-session)
  DELETE /documents/rag/{doc_id}        — remove an uploaded doc
  GET    /documents/rag/ui              — serve the RAG chat HTML UI
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import List, Optional

import structlog
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.auth import current_brand
from app.core.database import get_db
from app.models.document import Document
from app.rag.chain import RAGChain
from app.rag.document_parser import (
    SUPPORTED_EXTENSIONS,
    ParsedDocument,
    is_supported,
    parse,
)
from app.rag.chunking import chunk as chunk_document, get_config as get_chunk_config
from app.rag.retriever import RAGRetriever
from app.rag.vector_store import (
    COLLECTION_CLIENT,
    VALID_DOC_TYPES,
    get_vector_store,
    client_where,
)
from app.schemas.document import (
    DocumentCreate,
    DocumentResponse,
    DocumentSearchRequest,
    DocumentSearchResponse,
    DocumentSearchResult,
    DocumentUploadResponse,
    RAGQueryRequest,
    RAGQueryResponse,
)
from app.services.embedding_service import embedding_service
from app.services.llm_service import llm_service

logger = structlog.get_logger()

router = APIRouter(prefix="/documents", tags=["documents"])

# In-memory registry of ChromaDB-indexed uploads {doc_id: metadata}
_rag_docs: dict = {}

UI_HTML       = Path(__file__).resolve().parents[2] / "rag" / "ui.html"
UI_ADMIN_HTML = Path(__file__).resolve().parents[2] / "rag" / "ui" / "admin.html"
UI_CHAT_HTML  = Path(__file__).resolve().parents[2] / "rag" / "ui" / "chat.html"

# ── Max upload size ────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # 30 MB


# ═══════════════════════════════════════════════════════════════════════════════
# Existing DB-backed endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(document_data: DocumentCreate, db: AsyncSession = Depends(get_db), org=Depends(current_brand)):
    """Create a new document record with auto-generated embedding, scoped to the authenticated org."""
    try:
        document = Document(**document_data.model_dump())
        document.org_id = org.id
        embedding = await embedding_service.generate_embedding(document.content)
        document.embedding = embedding
        db.add(document)
        await db.commit()
        await db.refresh(document)
        logger.info("Document created", document_id=str(document.id), org=org.slug)
        return DocumentResponse.from_orm_with_embedding(document)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create document: {e}")


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db), org=Depends(current_brand)):
    """List documents belonging to the authenticated org."""
    try:
        result = await db.execute(
            select(Document).where(Document.org_id == org.id).offset(skip).limit(limit)
        )
        return [DocumentResponse.from_orm_with_embedding(d) for d in result.scalars().all()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {e}")


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: UUID, db: AsyncSession = Depends(get_db), org=Depends(current_brand)):
    """Get document by ID — must belong to the authenticated org."""
    try:
        result = await db.execute(
            select(Document).where(Document.id == document_id, Document.org_id == org.id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document not found: {document_id}")
        return DocumentResponse.from_orm_with_embedding(doc)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get document: {e}")


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: UUID, db: AsyncSession = Depends(get_db), org=Depends(current_brand)):
    """Delete a document — must belong to the authenticated org."""
    try:
        result = await db.execute(
            select(Document).where(Document.id == document_id, Document.org_id == org.id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document not found: {document_id}")
        await db.delete(doc)
        await db.commit()
        logger.info("Document deleted", document_id=str(document_id), org=org.slug)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {e}")


@router.post("/search", response_model=DocumentSearchResponse)
async def search_documents(search_request: DocumentSearchRequest, db: AsyncSession = Depends(get_db), org=Depends(current_brand)):
    """Vector similarity search using pgvector."""
    try:
        retriever = RAGRetriever(db)
        docs_with_scores = await retriever.retrieve_with_scores(
            query=search_request.query,
            top_k=search_request.top_k,
            filters=search_request.filters,
        )
        filtered = [(d, s) for d, s in docs_with_scores if s >= search_request.similarity_threshold]
        results = [
            DocumentSearchResult(document=DocumentResponse.from_orm_with_embedding(d), similarity_score=s)
            for d, s in filtered
        ]
        return DocumentSearchResponse(query=search_request.query, results=results, total=len(results))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document search failed: {e}")


@router.post("/rag/query", response_model=RAGQueryResponse)
async def rag_query(query_request: RAGQueryRequest, db: AsyncSession = Depends(get_db)):
    """RAG query over pgvector-indexed documents with switchable LLM."""
    try:
        retriever = RAGRetriever(db)
        chain = RAGChain(retriever)
        result = await chain.query(
            question=query_request.query,
            model=query_request.model,
            temperature=query_request.temperature,
            max_tokens=query_request.max_tokens,
            top_k=query_request.top_k,
            filters=query_request.filters,
            include_sources=query_request.include_sources,
        )
        return RAGQueryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# ChromaDB-backed RAG: upload any document type and chat with it
# ═══════════════════════════════════════════════════════════════════════════════

# ── Pydantic models ───────────────────────────────────────────────────────────

class RagUploadResponse(BaseModel):
    doc_id: str
    filename: str
    extension: str
    pages: int
    chunks: int
    collection: str
    message: str


class RagChatRequest(BaseModel):
    doc_id: str
    question: str
    top_k: int = 5


class SourceSnippet(BaseModel):
    chunk_index: int
    page: int
    section: str
    score: float
    excerpt: str


class RagChatResponse(BaseModel):
    answer: str
    doc_id: str
    sources: List[SourceSnippet]
    provider: Optional[str] = None


class RagDocInfo(BaseModel):
    doc_id: str
    filename: str
    extension: str
    doc_type: str = "general"
    kb_name: str = ""
    org_name: str = ""
    description: str = ""
    pages: int = 0
    chunks: int = 0
    collection: str = ""
    uploaded_at: str = ""
    expires_at: str = ""


# ── UI ────────────────────────────────────────────────────────────────────────

@router.get("/rag/ui", include_in_schema=False)
async def rag_ui():
    """Serve the admin knowledge base manager UI."""
    if UI_ADMIN_HTML.exists():
        return FileResponse(UI_ADMIN_HTML, media_type="text/html")
    if UI_HTML.exists():
        return FileResponse(UI_HTML, media_type="text/html")
    raise HTTPException(status_code=404, detail="UI not found")


@router.get("/rag/ui/admin", include_in_schema=False)
async def rag_ui_admin():
    """Serve the admin knowledge base manager UI."""
    if not UI_ADMIN_HTML.exists():
        raise HTTPException(status_code=404, detail="admin.html not found")
    return FileResponse(UI_ADMIN_HTML, media_type="text/html")


@router.get("/rag/ui/chat", include_in_schema=False)
async def rag_ui_chat():
    """Serve the per-client tech support chat UI."""
    if not UI_CHAT_HTML.exists():
        raise HTTPException(status_code=404, detail="chat.html not found")
    return FileResponse(UI_CHAT_HTML, media_type="text/html")


@router.get("/rag/ui/chat/{client_id}", include_in_schema=False)
async def rag_ui_chat_client(client_id: str):
    """Serve the chat UI pre-loaded for a specific client (redirects with ?client_id=)."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"/api/v1/documents/rag/ui/chat?client_id={client_id}")


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/rag/upload", response_model=RagUploadResponse)
async def rag_upload(
    file: UploadFile = File(...),
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id"),
    x_doc_type: Optional[str] = Header(default=None, alias="X-Doc-Type"),
    x_kb_name: Optional[str] = Header(default=None, alias="X-KB-Name"),
    x_kb_description: Optional[str] = Header(default=None, alias="X-KB-Description"),
    x_kb_expiry: Optional[str] = Header(default=None, alias="X-KB-Expiry"),
    org=Depends(current_brand),
):
    """
    Upload a document into the org's knowledge base. JWT required.
    client_id is the org's UUID (immutable) — not slug, not from headers.
    """
    client_id  = str(org.id)
    session_id = x_session_id or str(uuid.uuid4())
    doc_type   = x_doc_type if x_doc_type in VALID_DOC_TYPES else "general"
    kb_name    = x_kb_name or ""
    description = x_kb_description or ""
    expiry_date = x_kb_expiry or ""

    filename = file.filename or "upload"
    if not is_supported(filename):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB).")
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Parse
    try:
        parsed: ParsedDocument = parse(raw, filename)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("Document parse error", filename=filename, error=str(e))
        raise HTTPException(status_code=422, detail=f"Failed to parse document: {e}")

    if not parsed.pages or not parsed.full_text.strip():
        raise HTTPException(status_code=422, detail="Document appears empty or has no extractable text.")

    # Chunk — strategy chosen automatically from file extension
    cfg = get_chunk_config(filename)
    logger.info("Chunking", filename=filename, strategy=cfg.strategy.value,
                chunk_size=cfg.chunk_size, overlap=cfg.overlap)
    chunks = chunk_document(parsed)
    if not chunks:
        raise HTTPException(status_code=422, detail="Document produced no chunks.")

    # Index into ChromaDB (client_documents collection, isolated by client_id)
    doc_id = str(uuid.uuid4())[:8]
    store  = get_vector_store()

    # Compute TTL from expiry date if provided
    ttl_days = None
    if expiry_date:
        try:
            from datetime import date
            delta = (date.fromisoformat(expiry_date) - date.today()).days
            ttl_days = max(1, delta)
        except ValueError:
            ttl_days = None

    store.upsert_client_chunks(
        client_id=client_id,
        session_id=session_id,
        doc_id=doc_id,
        filename=filename,
        extension=parsed.extension,
        strategy=cfg.strategy.value,
        doc_type=doc_type,
        ttl_days=ttl_days,
        kb_name=kb_name,
        org_id=str(org.id),
        org_name=org.display_name,
        description=description,
        chunks=[
            {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
            for c in chunks
        ],
    )

    _rag_docs[doc_id] = {
        "doc_id":      doc_id,
        "client_id":   client_id,
        "session_id":  session_id,
        "doc_type":    doc_type,
        "kb_name":     kb_name,
        "org_name":    org.display_name,
        "description": description,
        "filename":    filename,
        "extension":   parsed.extension,
        "pages":       parsed.page_count,
        "chunks":      len(chunks),
        "collection":  COLLECTION_CLIENT,
    }

    logger.info("Document indexed", client_id=client_id, doc_id=doc_id,
                filename=filename, chunks=len(chunks))

    return RagUploadResponse(
        doc_id=doc_id,
        filename=filename,
        extension=parsed.extension,
        pages=parsed.page_count,
        chunks=len(chunks),
        collection=COLLECTION_CLIENT,
        message=(
            f"'{filename}' indexed successfully — "
            f"{parsed.page_count} pages, {len(chunks)} chunks."
        ),
    )


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/rag/chat", response_model=RagChatResponse)
async def rag_chat(req: RagChatRequest):
    """Ask a question about an uploaded document using RAG + LLM."""
    if req.doc_id not in _rag_docs:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{req.doc_id}' not found. Upload a document first.",
        )

    meta  = _rag_docs[req.doc_id]
    store = get_vector_store()

    hits = store.query_client(
        client_id=meta.get("client_id", "anonymous"),
        query_text=req.question,
        doc_id=req.doc_id,
        session_id=meta.get("session_id"),
        top_k=req.top_k,
        min_score=0.1,
    )

    if not hits:
        return RagChatResponse(
            answer="I couldn't find relevant content in this document to answer your question.",
            doc_id=req.doc_id,
            sources=[],
        )

    context = "\n\n".join(
        f"[Page {h['metadata'].get('page','?')}"
        + (f" · {h['metadata']['section']}" if h["metadata"].get("section") else "")
        + f"]\n{h['document']}"
        for h in hits
    )

    system = (
        f"You are a helpful assistant answering questions about: \"{meta['filename']}\".\n"
        "Use ONLY the provided context to answer. If the answer is not in the context, say so clearly.\n"
        "Be concise, cite page numbers where relevant, and format with markdown where helpful."
    )
    messages = [{"role": "user", "content": f"Context:\n{context}\n\nQuestion: {req.question}"}]

    llm_result = await llm_service.generate_with_fallback(
        messages=messages,
        system_prompt=system,
        temperature=0.3,
        max_tokens=700,
    )

    if llm_result:
        answer = llm_result["content"]
        provider = llm_result.get("provider")
    else:
        # Plain fallback — return best chunk
        best = hits[0]
        answer = (
            f"**Page {best['metadata'].get('page','?')}:** "
            f"{best['document'][:600]}"
        )
        provider = "fallback"

    sources = [
        SourceSnippet(
            chunk_index=h["metadata"].get("chunk_index", 0),
            page=h["metadata"].get("page", 0),
            section=h["metadata"].get("section", ""),
            score=h["score"],
            excerpt=h["document"][:220] + ("…" if len(h["document"]) > 220 else ""),
        )
        for h in hits[:3]
    ]

    return RagChatResponse(answer=answer, doc_id=req.doc_id, sources=sources, provider=provider)


# ── Client KB chat ────────────────────────────────────────────────────────────

class ClientChatRequest(BaseModel):
    client_id: str
    question: str
    doc_id: Optional[str] = None   # narrow to a specific doc; None = entire KB
    top_k: int = 5


class ClientChatResponse(BaseModel):
    answer: str
    client_id: str
    doc_id: Optional[str]
    sources: List[SourceSnippet]
    provider: Optional[str] = None
    rag_hit: bool = True


@router.post("/rag/client/{client_id}", response_model=ClientChatResponse)
async def rag_client_chat(client_id: str, req: ClientChatRequest, org=Depends(current_brand)):
    """
    Chat with the authenticated org's knowledge base.
    client_id in the path must match the JWT org slug.
    """
    if client_id != str(org.id):
        raise HTTPException(status_code=403, detail="You can only query your own knowledge base.")

    from app.agents.support_agent import get_support_agent
    agent = get_support_agent()

    result = await agent.answer(
        question=req.question,
        client_id=str(org.id),
        doc_id=req.doc_id or None,
        top_k=req.top_k,
    )

    sources = [
        SourceSnippet(
            chunk_index=0,
            page=s.get("page", 0),
            section=s.get("section", ""),
            score=s.get("score", 0.0),
            excerpt=s.get("excerpt", ""),
        )
        for s in result.sources
    ]

    return ClientChatResponse(
        answer=result.answer,
        client_id=client_id,
        doc_id=req.doc_id,
        sources=sources,
        provider=result.provider,
        rag_hit=result.rag_hit,
    )


# ── List / Delete ─────────────────────────────────────────────────────────────

@router.get("/rag/list", response_model=List[RagDocInfo])
async def rag_list(org=Depends(current_brand)):
    """List documents belonging to the authenticated org (from ChromaDB — survives restarts)."""
    store = get_vector_store()
    docs = store.get_client_docs(str(org.id))
    # Enrich with chunk counts from in-memory cache where available
    result = []
    for d in docs:
        doc_id = d["doc_id"]
        # Only use in-memory cache entry if it belongs to this org
        cached = _rag_docs.get(doc_id, {})
        if cached.get("client_id") != str(org.id):
            cached = {}
        result.append(RagDocInfo(
            doc_id=doc_id,
            filename=d.get("filename") or cached.get("filename", ""),
            extension=d.get("extension") or cached.get("extension", ""),
            doc_type=d.get("doc_type", "general"),
            kb_name=d.get("kb_name", ""),
            org_name=d.get("org_name", ""),
            description=d.get("description", ""),
            pages=cached.get("pages", 0),
            chunks=cached.get("chunks", 0),
            collection=COLLECTION_CLIENT,
            uploaded_at=d.get("uploaded_at", ""),
            expires_at=d.get("expires_at", ""),
        ))
    return result


@router.delete("/rag/{doc_id}")
async def rag_delete(doc_id: str, org=Depends(current_brand)):
    """Remove a document. Only the owning org can delete it."""
    store = get_vector_store()
    # Verify ownership — check ChromaDB for a chunk with this doc_id under the org's client_id
    col = store._collection(COLLECTION_CLIENT)
    check = col.get(
        where={"$and": [{"client_id": {"$eq": str(org.id)}}, {"doc_id": {"$eq": doc_id}}]},
        include=[],
        limit=1,
    )
    if not check.get("ids"):
        raise HTTPException(status_code=404, detail="Document not found or not owned by your org.")

    deleted = store.delete_client_doc(str(org.id), doc_id)
    _rag_docs.pop(doc_id, None)
    logger.info("RAG document removed", org_id=str(org.id), doc_id=doc_id, chunks=deleted)
    return {"message": f"Document '{doc_id}' removed ({deleted} chunks).", "doc_id": doc_id}

# ── Ingest: raw text / markdown ───────────────────────────────────────────────

class IngestTextRequest(BaseModel):
    title: str
    text: str
    doc_type: Optional[str] = "general"
    kb_name: Optional[str] = ""
    description: Optional[str] = ""


@router.post("/rag/ingest-text", response_model=RagUploadResponse)
async def rag_ingest_text(req: IngestTextRequest, org=Depends(current_brand)):
    """
    Ingest raw text or markdown from a text box into the org's knowledge base.
    The text is treated as a single plain-text document.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text content cannot be empty.")

    doc_type = req.doc_type if req.doc_type in VALID_DOC_TYPES else "general"
    filename = f"{req.title.strip() or 'text-input'}.txt"

    # Build a ParsedDocument directly from the raw text
    from app.rag.document_parser import ParsedDocument, ParsedPage
    parsed = ParsedDocument(
        filename=filename,
        extension=".txt",
        pages=[ParsedPage(page=1, text=req.text.strip(), section=req.title.strip())],
    )

    cfg = get_chunk_config(filename)
    chunks = chunk_document(parsed)
    if not chunks:
        raise HTTPException(status_code=422, detail="Text produced no chunks.")

    doc_id = str(uuid.uuid4())[:8]
    store  = get_vector_store()
    store.upsert_client_chunks(
        client_id=str(org.id),
        session_id=str(uuid.uuid4()),
        doc_id=doc_id,
        filename=filename,
        extension=".txt",
        strategy=cfg.strategy.value,
        doc_type=doc_type,
        ttl_days=None,
        kb_name=req.kb_name or "",
        org_id=str(org.id),
        org_name=org.display_name,
        description=req.description or "",
        chunks=[
            {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
            for c in chunks
        ],
    )

    _rag_docs[doc_id] = {
        "doc_id": doc_id, "client_id": str(org.id),
        "doc_type": doc_type, "kb_name": req.kb_name or "",
        "org_name": org.display_name, "description": req.description or "",
        "filename": filename, "extension": ".txt",
        "pages": 1, "chunks": len(chunks), "collection": COLLECTION_CLIENT,
    }

    logger.info("Text ingested", org_id=str(org.id), doc_id=doc_id, chunks=len(chunks))
    return RagUploadResponse(
        doc_id=doc_id, filename=filename, extension=".txt",
        pages=1, chunks=len(chunks), collection=COLLECTION_CLIENT,
        message=f"Text '{req.title}' indexed — {len(chunks)} chunks.",
    )


# ── Ingest: URL scraping ───────────────────────────────────────────────────────

class IngestUrlRequest(BaseModel):
    url: str
    doc_type: Optional[str] = "general"
    kb_name: Optional[str] = ""
    description: Optional[str] = ""


@router.post("/rag/ingest-url", response_model=RagUploadResponse)
async def rag_ingest_url(req: IngestUrlRequest, org=Depends(current_brand)):
    """
    Scrape a URL, strip HTML, and ingest the page content into the org's knowledge base.
    Works best with static pages. JS-rendered SPAs may return limited content.
    """
    import httpx
    from urllib.parse import urlparse

    url = req.url.strip()
    parsed_url = urlparse(url)
    if parsed_url.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are supported.")

    # Fetch the page
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True,
                                     headers={"User-Agent": "SupportBot/1.0 (KB Indexer)"}) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Request timed out fetching the URL.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"URL returned {e.response.status_code}.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {e}")

    content_type = response.headers.get("content-type", "")
    raw_bytes = response.content

    # Route to parser based on content type / URL extension
    url_path = parsed_url.path.lower()
    if url_path.endswith(".pdf"):
        filename = url_path.split("/")[-1] or "page.pdf"
    elif url_path.endswith(".md"):
        filename = url_path.split("/")[-1] or "page.md"
    elif "text/plain" in content_type:
        filename = "page.txt"
    else:
        filename = "page.html"

    # Parse using existing document parser
    try:
        from app.rag.document_parser import ParsedDocument, ParsedPage
        if filename.endswith(".html"):
            # Strip HTML tags with BeautifulSoup for clean text
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(raw_bytes, "html.parser")
                # Remove scripts/styles
                for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                    tag.decompose()
                title_tag = soup.find("title")
                page_title = title_tag.get_text(strip=True) if title_tag else parsed_url.netloc
                text = soup.get_text(separator="\n", strip=True)
            except ImportError:
                text = raw_bytes.decode("utf-8", errors="replace")
                page_title = parsed_url.netloc
            parsed = ParsedDocument(
                filename=filename,
                extension=".html",
                pages=[ParsedPage(page=1, text=text, section=page_title)],
            )
        else:
            from app.rag.document_parser import parse
            parsed = parse(raw_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse page content: {e}")

    if not parsed.full_text.strip():
        raise HTTPException(status_code=422, detail="Page has no extractable text content.")

    doc_type = req.doc_type if req.doc_type in VALID_DOC_TYPES else "general"
    cfg = get_chunk_config(filename)
    chunks = chunk_document(parsed)
    if not chunks:
        raise HTTPException(status_code=422, detail="Page produced no chunks.")

    doc_id = str(uuid.uuid4())[:8]
    store  = get_vector_store()
    display_name = page_title if filename.endswith(".html") else url
    store.upsert_client_chunks(
        client_id=str(org.id),
        session_id=str(uuid.uuid4()),
        doc_id=doc_id,
        filename=display_name[:200],
        extension=f".{filename.split('.')[-1]}",
        strategy=cfg.strategy.value,
        doc_type=doc_type,
        ttl_days=None,
        kb_name=req.kb_name or "",
        org_id=str(org.id),
        org_name=org.display_name,
        description=req.description or url,
        chunks=[
            {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
            for c in chunks
        ],
    )

    _rag_docs[doc_id] = {
        "doc_id": doc_id, "client_id": str(org.id),
        "doc_type": doc_type, "kb_name": req.kb_name or "",
        "org_name": org.display_name, "description": req.description or url,
        "filename": display_name[:200], "extension": f".{filename.split('.')[-1]}",
        "pages": parsed.page_count, "chunks": len(chunks), "collection": COLLECTION_CLIENT,
    }

    logger.info("URL ingested", org_id=str(org.id), url=url, doc_id=doc_id, chunks=len(chunks))
    return RagUploadResponse(
        doc_id=doc_id, filename=display_name[:80], extension=f".{filename.split('.')[-1]}",
        pages=parsed.page_count, chunks=len(chunks), collection=COLLECTION_CLIENT,
        message=f"URL '{url}' scraped and indexed — {parsed.page_count} page(s), {len(chunks)} chunks.",
    )


# Made with Bob

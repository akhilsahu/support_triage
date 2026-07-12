"""
Documents API — ChromaDB-backed RAG endpoints.

  POST   /documents/rag/upload          — upload any doc (PDF/DOCX/TXT/HTML/JSON/CSV)
  POST   /documents/rag/ingest-text     — ingest raw text / markdown
  POST   /documents/rag/ingest-url      — scrape a URL and ingest page content
  POST   /documents/rag/chat            — chat with an uploaded doc
  GET    /documents/rag/list            — list org's docs (from ChromaDB — survives restarts)
  DELETE /documents/rag/{doc_id}        — remove a doc
  POST   /documents/rag/client/{id}     — chat with entire org KB
  GET    /documents/rag/ui              — serve the RAG chat HTML UI
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import List, Optional

import structlog
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.auth import current_space
from app.rag.document_parser import ParsedDocument
from app.orchestra.ai.chunking import chunk as chunk_document, get_config as get_chunk_config
from app.orchestra.ai.ingestion import get_ingestion_service
from app.rag.vector_store import (
    COLLECTION_CLIENT,
    VALID_DOC_TYPES,
    get_vector_store,
)
from app.services.llm_service import llm_service

logger = structlog.get_logger()

router = APIRouter(prefix="/documents", tags=["documents"])


async def _generate_summary(content: str) -> str:
    """Generate a highly concise 1-2 sentence semantic summary of the text content."""
    if not content or not content.strip():
        return ""
    snippet = content[:6000].strip()
    system_prompt = (
        "You are an AI that writes extremely concise summaries for customer support documents. "
        "Write exactly one or two sentences summarizing the main topic or scope of this document. "
        "Do not include any intro, meta-commentary, or pleasantries."
    )
    try:
        res = await llm_service.generate_with_fallback(
            messages=[{"role": "user", "content": f"Document content:\n{snippet}\n\nSummary:"}],
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=150,
        )
        if res and res.get("content"):
            return res["content"].strip()
    except Exception as e:
        logger.warning("Failed to generate semantic summary", error=str(e))
    return ""


UI_HTML       = Path(__file__).resolve().parents[2] / "rag" / "ui.html"
UI_ADMIN_HTML = Path(__file__).resolve().parents[2] / "rag" / "ui" / "admin.html"
UI_CHAT_HTML  = Path(__file__).resolve().parents[2] / "rag" / "ui" / "chat.html"

# ── Max upload size ────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # 30 MB


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
    org=Depends(current_space),
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
    svc      = get_ingestion_service()

    if not svc.is_supported(filename):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: {', '.join(sorted(svc.supported_extensions()))}",
        )

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB).")
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        parsed: ParsedDocument = svc.parse(raw, filename)
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

    semantic_summary = await _generate_summary(parsed.full_text)

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
        space_id=str(org.id),
        org_name=org.display_name,
        description=description,
        semantic_summary=semantic_summary,
        chunks=[
            {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
            for c in chunks
        ],
    )

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
    store = get_vector_store()
    meta  = store.get_doc_meta(req.doc_id)
    if not meta:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{req.doc_id}' not found.",
        )

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
        "Be concise, cite page numbers where relevant, and format with markdown where helpful.\n"
        "When comparing multiple options, plans, or features, ALWAYS present the comparison using a structured Markdown table."
    )
    messages = [{"role": "user", "content": f"Context:\n{context}\n\nQuestion: {req.question}"}]

    llm_result = await llm_service.generate_with_fallback(
        messages=messages,
        system_prompt=system,
        temperature=0.3,
        max_tokens=1500,
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
async def rag_client_chat(client_id: str, req: ClientChatRequest, org=Depends(current_space)):
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
async def rag_list(org=Depends(current_space)):
    """List documents belonging to the authenticated org (from ChromaDB — survives restarts)."""
    store = get_vector_store()
    docs  = store.get_client_docs(str(org.id))
    return [
        RagDocInfo(
            doc_id=d["doc_id"],
            filename=d.get("filename", ""),
            extension=d.get("extension", ""),
            doc_type=d.get("doc_type", "general"),
            kb_name=d.get("kb_name", ""),
            org_name=d.get("org_name", ""),
            description=d.get("description", ""),
            chunks=d.get("chunks", 0),
            collection=COLLECTION_CLIENT,
            uploaded_at=d.get("uploaded_at", ""),
            expires_at=d.get("expires_at", ""),
        )
        for d in docs
    ]


@router.delete("/rag/{doc_id}")
async def rag_delete(doc_id: str, org=Depends(current_space)):
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
    logger.info("RAG document removed", space_id=str(org.id), doc_id=doc_id, chunks=deleted)
    return {"message": f"Document '{doc_id}' removed ({deleted} chunks).", "doc_id": doc_id}

# ── Ingest: raw text / markdown ───────────────────────────────────────────────

class IngestTextRequest(BaseModel):
    title: str
    text: str
    doc_type: Optional[str] = "general"
    kb_name: Optional[str] = ""
    description: Optional[str] = ""


@router.post("/rag/ingest-text", response_model=RagUploadResponse)
async def rag_ingest_text(req: IngestTextRequest, org=Depends(current_space)):
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
    semantic_summary = await _generate_summary(req.text)
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
        space_id=str(org.id),
        org_name=org.display_name,
        description=req.description or "",
        semantic_summary=semantic_summary,
        chunks=[
            {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
            for c in chunks
        ],
    )

    logger.info("Text ingested", space_id=str(org.id), doc_id=doc_id, chunks=len(chunks))
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
async def rag_ingest_url(req: IngestUrlRequest, org=Depends(current_space)):
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

    # Parse via the ingestion pipeline — HtmlParser gives heading-aware sections
    # and table extraction; PdfParser/TextParser handle .pdf/.md/.txt. Same
    # pipeline as file uploads, so URL-sourced docs chunk identically.
    svc = get_ingestion_service()
    try:
        parsed = svc.parse(raw_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse page content: {e}")

    page_title = (parsed.metadata or {}).get("title") or parsed_url.netloc

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
    semantic_summary = await _generate_summary(parsed.full_text)
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
        space_id=str(org.id),
        org_name=org.display_name,
        description=req.description or url,
        semantic_summary=semantic_summary,
        chunks=[
            {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
            for c in chunks
        ],
    )

    logger.info("URL ingested", space_id=str(org.id), url=url, doc_id=doc_id, chunks=len(chunks))
    return RagUploadResponse(
        doc_id=doc_id, filename=display_name[:80], extension=f".{filename.split('.')[-1]}",
        pages=parsed.page_count, chunks=len(chunks), collection=COLLECTION_CLIENT,
        message=f"URL '{url}' scraped and indexed — {parsed.page_count} page(s), {len(chunks)} chunks.",
    )


# Made with Bob

"""
RAG API — PDF upload, processing, and chat endpoints.

Routes:
  GET  /api/v1/rag/ui          — serve the chat UI (ui.html)
  POST /api/v1/rag/upload      — upload & index a PDF
  POST /api/v1/rag/chat        — query indexed documents
  GET  /api/v1/rag/documents   — list indexed documents
  DELETE /api/v1/rag/documents/{doc_id} — remove a document
"""

from __future__ import annotations

import io
import re
import uuid
from pathlib import Path
from typing import List, Optional

import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from app.rag.vector_store import get_vector_store, COLLECTION_CUSTOM
from app.services.llm_service import llm_service

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/rag", tags=["RAG"])

UI_HTML = Path(__file__).parent / "ui.html"

# In-memory index of uploaded docs: {doc_id: {name, chunks, collection}}
_uploaded_docs: dict = {}


# ── UI ────────────────────────────────────────────────────────────────────────

@router.get("/ui", include_in_schema=False)
async def serve_ui():
    if not UI_HTML.exists():
        raise HTTPException(status_code=404, detail="ui.html not found")
    return FileResponse(UI_HTML, media_type="text/html")


# ── Upload ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    pages: int
    chunks: int
    collection: str
    message: str


@router.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF, extract text, chunk it, embed into ChromaDB.
    Returns a doc_id to use in /chat requests.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    raw = await file.read()
    if len(raw) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(status_code=400, detail="File too large (max 20 MB).")

    # Extract text
    try:
        pages_text = _extract_pdf_text(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF extraction failed: {e}")

    if not any(t.strip() for t in pages_text):
        raise HTTPException(status_code=422, detail="PDF appears to be empty or image-only (no extractable text).")

    # Chunk text
    chunks = _chunk_pages(pages_text, chunk_size=1000, overlap=150)

    # Store in vector DB
    doc_id = str(uuid.uuid4())[:8]
    collection = f"pdf_{doc_id}"
    store = get_vector_store()
    ids = [f"{doc_id}-{i}" for i in range(len(chunks))]
    metas = [
        {"doc_id": doc_id, "filename": file.filename, "chunk": i, "page": c["page"]}
        for i, c in enumerate(chunks)
    ]
    store.upsert(collection, ids, [c["text"] for c in chunks], metas)

    _uploaded_docs[doc_id] = {
        "doc_id": doc_id,
        "filename": file.filename,
        "pages": len(pages_text),
        "chunks": len(chunks),
        "collection": collection,
    }

    logger.info("PDF indexed", doc_id=doc_id, filename=file.filename, chunks=len(chunks))

    return UploadResponse(
        doc_id=doc_id,
        filename=file.filename,
        pages=len(pages_text),
        chunks=len(chunks),
        collection=collection,
        message=f"Successfully indexed {len(chunks)} chunks from {len(pages_text)} pages.",
    )


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    doc_id: str
    question: str
    top_k: int = 5


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]
    doc_id: str
    provider: Optional[str] = None


@router.post("/chat", response_model=ChatResponse)
async def chat_with_pdf(req: ChatRequest):
    """Query an uploaded PDF using RAG."""
    if req.doc_id not in _uploaded_docs:
        raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' not found. Upload a PDF first.")

    doc_meta = _uploaded_docs[req.doc_id]
    store = get_vector_store()

    hits = store.query(
        doc_meta["collection"],
        req.question,
        top_k=req.top_k,
        min_score=0.1,
    )

    if not hits:
        return ChatResponse(
            answer="I couldn't find relevant content in the document to answer that question.",
            sources=[],
            doc_id=req.doc_id,
        )

    context = "\n\n".join(
        f"[Page {h['metadata'].get('page', '?')}] {h['document']}" for h in hits
    )

    system = (
        f"You are a helpful assistant answering questions about the document: \"{doc_meta['filename']}\".\n"
        "Use ONLY the context below to answer. If the answer is not in the context, say so clearly.\n"
        "Be concise and cite page numbers where relevant."
    )
    messages = [{"role": "user", "content": f"Context:\n{context}\n\nQuestion: {req.question}"}]

    llm_result = await llm_service.generate_with_fallback(
        messages=messages,
        system_prompt=system,
        temperature=0.3,
        max_tokens=600,
    )

    answer = llm_result["content"] if llm_result else _fallback_answer(hits, req.question)
    provider = llm_result.get("provider") if llm_result else "fallback"

    return ChatResponse(
        answer=answer,
        sources=[
            {
                "chunk": h["metadata"].get("chunk"),
                "page": h["metadata"].get("page"),
                "score": h["score"],
                "excerpt": h["document"][:200] + ("..." if len(h["document"]) > 200 else ""),
            }
            for h in hits[:3]
        ],
        doc_id=req.doc_id,
        provider=provider,
    )


# ── Documents list ────────────────────────────────────────────────────────────

@router.get("/documents")
async def list_documents():
    return {"documents": list(_uploaded_docs.values()), "total": len(_uploaded_docs)}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    if doc_id not in _uploaded_docs:
        raise HTTPException(status_code=404, detail="Document not found.")
    meta = _uploaded_docs.pop(doc_id)
    store = get_vector_store()
    try:
        store.reset_collection(meta["collection"])
    except Exception:
        pass
    return {"message": f"Document '{meta['filename']}' deleted.", "doc_id": doc_id}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_pdf_text(raw: bytes) -> List[str]:
    """Extract per-page text from PDF bytes. Uses pypdf."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(raw))
        return [page.extract_text() or "" for page in reader.pages]
    except ImportError:
        pass
    # Fallback: PyPDF2
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(raw))
        return [page.extract_text() or "" for page in reader.pages]
    except ImportError:
        raise RuntimeError("Install pypdf: pip install pypdf")


def _chunk_pages(pages: List[str], chunk_size: int = 500, overlap: int = 50) -> List[dict]:
    """Split page text into overlapping chunks."""
    chunks = []
    for page_num, text in enumerate(pages, 1):
        text = re.sub(r'\s+', ' ', text).strip()
        if not text:
            continue
        words = text.split()
        i = 0
        while i < len(words):
            chunk_words = words[i: i + chunk_size]
            chunks.append({"text": " ".join(chunk_words), "page": page_num})
            i += chunk_size - overlap
    return chunks


def _fallback_answer(hits: list, question: str) -> str:
    best = hits[0]
    return (
        f"Based on the document (page {best['metadata'].get('page', '?')}):\n\n"
        f"{best['document'][:500]}"
    )

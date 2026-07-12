"""
Admin API — client knowledge base management.

Endpoints:
  POST   /admin/clients/{client_id}/knowledge-base
         — bulk upload multiple files as a client's knowledge base.
           All files are tagged with doc_type (default: tech_support) and no TTL expiry.

  GET    /admin/clients/{client_id}/knowledge-base
         — list all documents in a client's knowledge base.

  DELETE /admin/clients/{client_id}/knowledge-base/{doc_id}
         — remove a specific document from a client's knowledge base.

  POST   /admin/purge-expired
         — delete all chunks whose expires_at has passed.

  GET    /admin/stats
         — collection-level counts.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

import structlog
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

from app.orchestra.ai.chunking import get_config as get_chunk_config
from app.orchestra.ai.chunking import chunk as chunk_document
from app.orchestra.ai.ingestion import get_ingestion_service
from app.rag.document_parser import ParsedDocument
from app.rag.vector_store import VALID_DOC_TYPES, get_vector_store

logger = structlog.get_logger()

router = APIRouter(prefix="/admin", tags=["admin"])

# Admin session ID — permanent uploads use this (no expiry)
ADMIN_SESSION = "admin"


# ── Response models ───────────────────────────────────────────────────────────

class KBUploadResult(BaseModel):
    doc_id:    str
    filename:  str
    extension: str
    pages:     int
    chunks:    int
    doc_type:  str
    status:    str  # "indexed" | "failed"
    error:     Optional[str] = None


class KBUploadResponse(BaseModel):
    client_id: str
    doc_type:  str
    total_files: int
    indexed:   int
    failed:    int
    results:   List[KBUploadResult]


class KBDocInfo(BaseModel):
    doc_id:      str
    client_id:   str
    filename:    str
    extension:   str
    doc_type:    str
    strategy:    str
    uploaded_at: str
    expires_at:  str


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post(
    "/clients/{client_id}/knowledge-base",
    response_model=KBUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_knowledge_base(
    client_id: str,
    files: List[UploadFile] = File(...),
    doc_type: str = Query(default="tech_support", description=f"One of: {', '.join(sorted(VALID_DOC_TYPES))}"),
):
    """
    Bulk-upload files into a client's knowledge base.

    - All files are tagged with the given client_id and doc_type.
    - No TTL expiry — admin uploads are permanent until explicitly deleted.
    - Supported formats: PDF, DOCX, DOC, TXT, MD, HTML, JSON, JSONL, CSV
    """
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid doc_type '{doc_type}'. Valid values: {', '.join(sorted(VALID_DOC_TYPES))}",
        )

    store = get_vector_store()
    svc   = get_ingestion_service()
    results: List[KBUploadResult] = []

    for file in files:
        filename = file.filename or "upload"

        if not svc.is_supported(filename):
            results.append(KBUploadResult(
                doc_id="", filename=filename, extension="", pages=0, chunks=0,
                doc_type=doc_type, status="failed",
                error=f"Unsupported file type. Supported: {', '.join(sorted(svc.supported_extensions()))}",
            ))
            continue

        try:
            raw = await file.read()
            if not raw:
                raise ValueError("File is empty.")
            if len(raw) > 50 * 1024 * 1024:
                raise ValueError("File too large (max 50 MB for admin uploads).")

            parsed: ParsedDocument = svc.parse(raw, filename)
            if not parsed.pages or not parsed.full_text.strip():
                raise ValueError("Document has no extractable text.")

            cfg    = get_chunk_config(filename)
            chunks = chunk_document(parsed)
            if not chunks:
                raise ValueError("Document produced no chunks.")

            doc_id = str(uuid.uuid4())[:8]

            store.upsert_client_chunks(
                client_id=client_id,
                session_id=ADMIN_SESSION,
                doc_id=doc_id,
                filename=filename,
                extension=parsed.extension,
                strategy=cfg.strategy.value,
                doc_type=doc_type,
                chunks=[
                    {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
                    for c in chunks
                ],
                ttl_days=None,  # permanent — no expiry
            )

            logger.info(
                "KB doc indexed",
                client_id=client_id,
                doc_id=doc_id,
                filename=filename,
                doc_type=doc_type,
                chunks=len(chunks),
            )

            results.append(KBUploadResult(
                doc_id=doc_id,
                filename=filename,
                extension=parsed.extension,
                pages=parsed.page_count,
                chunks=len(chunks),
                doc_type=doc_type,
                status="indexed",
            ))

        except Exception as e:
            logger.error("KB upload failed", client_id=client_id, filename=filename, error=str(e))
            results.append(KBUploadResult(
                doc_id="", filename=filename, extension="", pages=0, chunks=0,
                doc_type=doc_type, status="failed", error=str(e),
            ))

    indexed = sum(1 for r in results if r.status == "indexed")
    failed  = len(results) - indexed

    return KBUploadResponse(
        client_id=client_id,
        doc_type=doc_type,
        total_files=len(results),
        indexed=indexed,
        failed=failed,
        results=results,
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/clients/{client_id}/knowledge-base", response_model=List[KBDocInfo])
async def list_knowledge_base(client_id: str):
    """List all documents in a client's knowledge base."""
    store = get_vector_store()
    docs  = store.get_client_docs(client_id)
    return [
        KBDocInfo(
            doc_id=d.get("doc_id", ""),
            client_id=d.get("client_id", client_id),
            filename=d.get("filename", ""),
            extension=d.get("extension", ""),
            doc_type=d.get("doc_type", "general"),
            strategy=d.get("strategy", ""),
            uploaded_at=d.get("uploaded_at", ""),
            expires_at=d.get("expires_at", "never"),
        )
        for d in docs
    ]


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/clients/{client_id}/knowledge-base/{doc_id}")
async def delete_kb_doc(client_id: str, doc_id: str):
    """Remove a specific document from a client's knowledge base."""
    store   = get_vector_store()
    deleted = store.delete_client_doc(client_id, doc_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found for client '{client_id}'.")
    return {"message": f"Deleted {deleted} chunks for doc '{doc_id}'.", "client_id": client_id, "doc_id": doc_id}


# ── Purge expired ─────────────────────────────────────────────────────────────

@router.post("/purge-expired")
async def purge_expired():
    """Delete all chunks whose expires_at timestamp has passed."""
    store   = get_vector_store()
    deleted = store.purge_expired()
    return {"message": f"Purged {deleted} expired chunks.", "deleted": deleted}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats():
    """Collection-level document counts."""
    store = get_vector_store()
    return store.stats()

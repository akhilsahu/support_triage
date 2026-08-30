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

import tempfile
import uuid
from pathlib import Path
from typing import List, Literal, Optional

import anyio
import structlog
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_space
from app.core.database import get_db
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


async def _resolve_kb_id(kb_id: Optional[str], org, db: AsyncSession) -> Optional[str]:
    """
    Validate that `kb_id` is well-formed AND belongs to the caller's space.

    Ownership is checked here, not just format: without it a caller could pass
    another space's kb_id and have a KnowledgeBaseItem row appear on that
    space's dashboard. (Retrieval would still not leak across spaces — chunks
    are additionally scoped by client_id — but a phantom row in someone else's
    KB is not something a tenant should be able to create.)

    Returns the id unchanged, or None when no kb_id was supplied.
    """
    from app.models.knowledge_base import KnowledgeBase

    if not kb_id:
        return None
    try:
        kb_uuid = uuid.UUID(kb_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid kb_id.")

    found = (await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_uuid,
            KnowledgeBase.space_id == org.id,
        )
    )).scalar_one_or_none()
    if not found:
        raise HTTPException(status_code=404, detail="Knowledge base not found.")
    return str(kb_uuid)


async def _link_kb_item(kb_id: Optional[str], doc_id: str, title: str) -> None:
    """
    Register the freshly indexed doc as a KnowledgeBaseItem so it shows on the
    KB dashboard. Reuses the ingestion job's helper (retries transient DB
    failures) rather than duplicating that logic here.

    Non-fatal by design, matching the file-upload path: the content is already
    indexed and retrievable, so a dashboard-linking failure should not present
    the whole ingestion as failed — but it IS logged at error level, because
    the result is content an agent can use that the owner cannot see.
    """
    if not kb_id:
        return
    from app.orchestra.ai.ingestion.jobs.tasks import _attach_kb_item
    try:
        await _attach_kb_item(kb_id, doc_id, title)
    except Exception as e:
        logger.error("ingest.kb_link_failed", kb_id=kb_id, doc_id=doc_id, error=str(e))


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


class RagUploadAcceptedResponse(BaseModel):
    """202 response — the document was accepted and is being processed.

    Ingestion of a large PDF takes minutes (vision runs over every embedded
    image), so the client gets a job id to follow instead of holding a request
    open past its timeout. Poll /documents/ingestion-jobs/{job_id}.
    """
    job_id: str
    filename: str
    status: str
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

@router.post("/rag/upload", response_model=RagUploadAcceptedResponse, status_code=202)
async def rag_upload(
    file: UploadFile = File(...),
    x_session_id: Optional[str] = Header(default=None, alias="X-Session-Id"),
    x_doc_type: Optional[str] = Header(default=None, alias="X-Doc-Type"),
    x_kb_name: Optional[str] = Header(default=None, alias="X-KB-Name"),
    x_kb_description: Optional[str] = Header(default=None, alias="X-KB-Description"),
    x_kb_expiry: Optional[str] = Header(default=None, alias="X-KB-Expiry"),
    x_kb_id: Optional[str] = Header(default=None, alias="X-KB-Id"),
    x_item_title: Optional[str] = Header(default=None, alias="X-Item-Title"),
    x_topic: Optional[str] = Header(default=None, alias="X-Topic"),
    x_doc_label: Optional[str] = Header(default=None, alias="X-Doc-Label"),
    x_contextual_enrichment: Optional[str] = Header(default=None, alias="X-Contextual-Enrichment"),
    org=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    session_id  = x_session_id or str(uuid.uuid4())
    doc_type    = x_doc_type if x_doc_type in VALID_DOC_TYPES else "general"
    kb_name     = x_kb_name or ""
    description = x_kb_description or ""
    expiry_date = x_kb_expiry or ""
    enable_enrichment: bool = True
    if x_contextual_enrichment is not None:
        enable_enrichment = x_contextual_enrichment.strip().lower() in ("true", "1", "yes", "on")


    # When the upload belongs to a knowledge base, the KB item can only be
    # created once ingestion yields a doc_id -- so the job carries the linkage
    # and the task creates the item on success.
    #
    # Ownership is verified, not just the uuid format: otherwise a caller could
    # pass another space's kb_id and have an item row appear on that space's
    # dashboard once the job finishes. (Retrieval never crossed spaces either
    # way -- chunks are also scoped by client_id -- but creating rows in
    # someone else's KB is not something a tenant should be able to do.)
    resolved_kb = await _resolve_kb_id(x_kb_id, org, db)
    kb_uuid = uuid.UUID(resolved_kb) if resolved_kb else None

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

    # Hand the bytes to the worker via disk rather than memory: the payload has
    # to survive this request, and under the Celery backend it crosses a process
    # boundary. The task no longer deletes it when it finishes.
    tmp_dir = Path("uploads").absolute()
    tmp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = tmp_dir / f"{uuid.uuid4().hex}_{Path(filename).name}"
    temp_path.write_bytes(raw)

    job_row = IngestionJob(
        space_id=org.id,
        kb_id=kb_uuid,
        filename=filename,
        doc_type=doc_type,
        kb_name=kb_name or None,
        status="queued",
        progress=0,
        stage_detail="Waiting to start",
    )
    db.add(job_row)
    await db.commit()
    await db.refresh(job_row)

    # The exact ingest_document args, replayed verbatim by the retry endpoint
    # if this job fails or dies in a restart. The temp file survives the crash
    # (the task only deletes it in its own `finally`), so a restart-interrupted
    # job can resume with the same bytes.
    task_kwargs = dict(
        job_id=str(job_row.id),
        space_id=str(org.id),
        temp_path=str(temp_path),
        filename=filename,
        doc_type=doc_type,
        session_id=session_id,
        kb_name=kb_name,
        description=description,
        expiry_date=expiry_date,
        org_name=org.display_name or "",
        kb_id=str(kb_uuid) if kb_uuid else "",
        item_title=x_item_title or filename,
        topic=x_topic or "",
        doc_label=x_doc_label or "",
        enable_enrichment=enable_enrichment,
    )
    job_row.retry_payload = {"task": task_kwargs}
    await db.commit()

    get_job_runner().enqueue("ingest_document", **task_kwargs)

    logger.info("ingestion.job.queued", job_id=str(job_row.id),
                filename=filename, space_id=str(org.id))

    return RagUploadAcceptedResponse(
        job_id=str(job_row.id),
        filename=filename,
        status="queued",
        message=f"'{filename}' uploaded — processing in the background.",
    )


# ── Ingestion job status ──────────────────────────────────────────────────────

@router.get("/ingestion-jobs")
async def list_ingestion_jobs(
    limit: int = 20,
    org=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Recent ingestion jobs for this space, newest first — drives the
    "processing…" rows in the knowledge base listing."""
    from app.models.ingestion_job import IngestionJob
    rows = (await db.execute(
        select(IngestionJob)
        .where(IngestionJob.space_id == org.id)
        .order_by(IngestionJob.created_at.desc())
        .limit(max(1, min(limit, 100)))
    )).scalars().all()
    return {"jobs": [r.to_dict() for r in rows]}


@router.get("/ingestion-jobs/{job_id}")
async def get_ingestion_job(
    job_id: str,
    org=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """Single job, for polling one upload's progress."""
    from app.models.ingestion_job import IngestionJob
    try:
        row = await db.get(IngestionJob, uuid.UUID(job_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid job id.")
    # Scope to the caller's space so one tenant can't read another's jobs.
    if row is None or row.space_id != org.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    return row.to_dict()


@router.post("/ingestion-jobs/{job_id}/retry", response_model=RagUploadAcceptedResponse, status_code=202)
async def retry_ingestion_job(
    job_id: str,
    org=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    Re-queue a failed ingestion job from the payload stored at enqueue time.

    A failure — including a job killed by a server restart, which previously
    forced the user to upload the document again — can be resumed instead.
    File uploads replay the original temp bytes (which survive a crash); URL
    jobs re-fetch the page when those bytes are gone.
    """
    from app.models.ingestion_job import IngestionJob
    from app.orchestra.ai.ingestion.jobs import get_job_runner

    try:
        row = await db.get(IngestionJob, uuid.UUID(job_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid job id.")
    if row is None or row.space_id != org.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    if row.status != "failed":
        raise HTTPException(status_code=409, detail="Only failed jobs can be retried.")

    payload = row.retry_payload or {}
    task_kwargs = dict(payload.get("task") or {})
    if not task_kwargs:
        raise HTTPException(
            status_code=409,
            detail="This job has no replayable payload; upload the document again.",
        )

    refetched = False
    temp_path = Path(task_kwargs.get("temp_path") or "")
    # The task deletes the temp bytes on a genuine failure, so they may be gone.
    # URL jobs can fall back to re-fetching the page; file uploads cannot.
    if not temp_path.is_file():
        url = (payload.get("url") or "").strip()
        if not url:
            raise HTTPException(
                status_code=409,
                detail="The source file is no longer available; upload the document again.",
            )
        from app.orchestra.ai.ingestion.scraper import fetch_url, ScrapeError
        try:
            page = await fetch_url(url)
        except ScrapeError as e:
            raise HTTPException(status_code=e.status_hint, detail=str(e))
        tmp_dir = Path("uploads").absolute()
        tmp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = tmp_dir / f"{uuid.uuid4().hex}_{page.filename}"
        temp_path.write_bytes(page.raw)
        task_kwargs["temp_path"] = str(temp_path)
        task_kwargs["filename"] = page.filename   # parser selection follows the re-fetched bytes
        task_kwargs["source_url"] = page.final_url
        refetched = True

    # Reset to queued so the UI picks this up as an in-flight job again. The row
    # keeps its id — the KB screen polls by kb_id and swaps done rows for the
    # finished document, so the same progress UI tracks both attempts.
    row.status = "queued"
    row.progress = 0
    row.stage_detail = "Waiting to start"
    row.error = None
    row.doc_id = None
    row.pages = None
    row.chunks = None
    await db.commit()

    get_job_runner().enqueue("ingest_document", **task_kwargs)
    logger.info("ingestion.job.retried", job_id=str(row.id), source=row.source,
                refetched=refetched, space_id=str(org.id))

    return RagUploadAcceptedResponse(
        job_id=str(row.id),
        filename=row.filename,
        status="queued",
        message=f"Retrying '{row.filename}' — processing in the background.",
    )


@router.delete("/ingestion-jobs/{job_id}", status_code=204)
async def dismiss_ingestion_job(
    job_id: str,
    org=Depends(current_space),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a finished job row from the listing.

    Failed jobs are kept visible on purpose — an upload that silently vanished
    would be worse. But without a way to clear one, a single old failure stays
    pinned to the knowledge base forever and reappears on every visit long
    after it stopped being actionable. This is the other half of that: the user
    acknowledges it and it goes.

    Only terminal jobs can be dismissed; deleting a running one would orphan
    the worker's progress writes and make the upload look like it disappeared.
    """
    from app.models.ingestion_job import IngestionJob
    try:
        row = await db.get(IngestionJob, uuid.UUID(job_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid job id.")
    if row is None or row.space_id != org.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not row.is_terminal:
        raise HTTPException(status_code=409, detail="Job is still running.")

    await db.delete(row)
    await db.commit()
    logger.info("ingestion.job.dismissed", job_id=job_id, space_id=str(org.id))


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

    context_parts = []
    for h in hits:
        fname = h["metadata"].get("filename") or h["metadata"].get("doc_name") or meta.get("filename") or "document"
        sec = h["metadata"].get("section") or ""
        pg = h["metadata"].get("page", "?")
        header = f"[DOCUMENT BREADCRUMB: {fname} > {sec} (Page {pg})]" if sec else f"[DOCUMENT BREADCRUMB: {fname} (Page {pg})]"
        context_parts.append(f"{header}\n{h['document']}")
    context = "\n\n".join(context_parts)


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
    # Without this the chunks are stamped kb_id="" and every custom agent
    # (which scopes retrieval with `kb_id $in [...]`) is blind to them — the
    # content is indexed but permanently unreachable. See agno_chroma.py.
    kb_id: Optional[str] = None
    description: Optional[str] = ""


@router.post("/rag/ingest-text", response_model=RagUploadResponse)
async def rag_ingest_text(req: IngestTextRequest, org=Depends(current_space),
                          db: AsyncSession = Depends(get_db)):
    """
    Ingest raw text or markdown from a text box into the org's knowledge base.
    The text is treated as a single plain-text document.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text content cannot be empty.")

    kb_id = await _resolve_kb_id(req.kb_id, org, db)

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
        kb_id=kb_id or "",
        space_id=str(org.id),
        org_name=org.display_name,
        description=req.description or "",
        semantic_summary=semantic_summary,
        chunks=[
            {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
            for c in chunks
        ],
    )
    await _link_kb_item(kb_id, doc_id, req.title.strip() or filename)

    logger.info("Text ingested", space_id=str(org.id), doc_id=doc_id,
                kb_id=kb_id, chunks=len(chunks))
    return RagUploadResponse(
        doc_id=doc_id, filename=filename, extension=".txt",
        pages=1, chunks=len(chunks), collection=COLLECTION_CLIENT,
        message=f"Text '{req.title}' indexed — {len(chunks)} chunks.",
    )


# ── Ingest: URL scraping ───────────────────────────────────────────────────────

class IngestUrlRequest(BaseModel):
    url: str
    title: Optional[str] = ""
    doc_type: Optional[str] = "general"
    kb_name: Optional[str] = ""
    # See IngestTextRequest.kb_id — without it the scraped page is indexed but
    # unreachable by every custom agent.
    kb_id: Optional[str] = None
    description: Optional[str] = ""
    topic: Optional[str] = ""
    doc_label: Optional[str] = ""
    # From /rag/preview-url. Reuses the exact bytes the user reviewed instead
    # of re-fetching, so the page can't change between preview and confirm.
    # Optional: without one this endpoint fetches fresh, keeping it usable
    # directly from the API.
    preview_token: Optional[str] = None
    preview_mode: Literal["quick", "deep"] = "quick"



class PreviewUrlRequest(BaseModel):
    url: str
    mode: Literal["quick", "deep"] = "quick"


class PreviewQuality(BaseModel):
    rating: Literal["good", "questionable", "poor"]
    score: int = Field(ge=0, le=100)
    reasons: list[str]


class PreviewUrlResponse(BaseModel):
    preview_token: str
    mode: Literal["quick", "deep"]
    provider: str
    quality: PreviewQuality
    title: str
    final_url: str          # after redirects — differs from the input surprisingly often
    content_type: str
    size_bytes: int
    page_count: int
    char_count: int
    extract: str            # leading text, for the user to eyeball
    truncated: bool
    # True when the source was a PDF: preview skips the vision pass (which can
    # run minutes), so embedded images/scans are NOT represented in `extract`
    # but WILL be read during actual indexing.
    vision_skipped: bool


# How much extracted text to hand back. Enough to tell "this is the right page"
# and "this isn't an empty SPA shell" without shipping a whole document.
_PREVIEW_EXTRACT_CHARS = 4000


@router.post("/rag/preview-url", response_model=PreviewUrlResponse)
async def rag_preview_url(req: PreviewUrlRequest, org=Depends(current_space)):
    """
    Fetch and parse a URL, return what was extracted — WITHOUT indexing it.

    Exists so the user can confirm they got the page they meant before it lands
    in the knowledge base. The most common failures this surfaces are a
    redirect landing somewhere unexpected, and a JavaScript-rendered site
    yielding an empty shell — both invisible if you just index and hope.

    The bytes are cached under `preview_token`; passing that to /rag/ingest-url
    ingests exactly what was shown here rather than re-fetching.
    """
    from dataclasses import replace as _replace
    from app.orchestra.ai.ingestion.config import build_ingestion_config
    from app.orchestra.ai.ingestion.ingestion import IngestionService
    from app.orchestra.ai.ingestion.scraper import (
        DeepPreviewLease,
        ScrapeError,
        fetch_url,
        store_preview,
    )
    from app.orchestra.ai.ingestion.scraper.quality import assess_extraction

    try:
        if req.mode == "deep":
            # Authentication currently identifies a single owner principal per
            # space, so the space id is also the in-flight principal id.
            async with DeepPreviewLease(space_id=str(org.id), user_id=str(org.id)):
                page = await fetch_url(req.url.strip(), mode=req.mode)
        else:
            page = await fetch_url(req.url.strip(), mode=req.mode)
    except ScrapeError as e:
        raise HTTPException(status_code=e.status_hint, detail=str(e))

    # Vision off for preview. On a scanned PDF the vision pass is the slow part
    # (minutes) and this request has to feel instant — the real ingestion still
    # runs it. Flagged back to the caller so the UI can say so rather than let
    # a thin extract look like a broken page.
    is_pdf = page.filename.endswith(".pdf")
    cfg = build_ingestion_config()
    if is_pdf:
        cfg = _replace(cfg, vision_enabled=False)

    try:
        parsed = await anyio.to_thread.run_sync(
            IngestionService(cfg).parse, page.raw, page.filename
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read page content: {e}")

    text = (parsed.full_text or "").strip()
    quality = assess_extraction(text)
    token = store_preview(str(org.id), page)

    logger.info("scraper.preview", space_id=str(org.id), url=req.url,
                final_url=page.final_url, chars=len(text), pages=parsed.page_count,
                provider=page.provider, mode=page.mode, quality=quality.rating)

    return PreviewUrlResponse(
        preview_token=token,
        mode=page.mode,
        provider=page.provider,
        quality=PreviewQuality(
            rating=quality.rating,
            score=quality.score,
            reasons=list(quality.reasons),
        ),
        title=page.title,
        final_url=page.final_url,
        content_type=page.content_type,
        size_bytes=page.size_bytes,
        page_count=parsed.page_count,
        char_count=len(text),
        # Do not truncate preview extract to allow the frontend to scroll and view the complete page content
        extract=text,
        truncated=False,
        vision_skipped=is_pdf,
    )


@router.post("/rag/ingest-url", response_model=RagUploadAcceptedResponse, status_code=202)
async def rag_ingest_url(req: IngestUrlRequest,
                         x_contextual_enrichment: Optional[str] = Header(default=None, alias="X-Contextual-Enrichment"),
                         org=Depends(current_space),
                         db: AsyncSession = Depends(get_db)):

    """
    Scrape a URL and ingest the page into the org's knowledge base.
    Works best with static pages. JS-rendered SPAs may return limited content.

    Split deliberately: the FETCH stays inline (bounded, and its failure modes —
    404, timeout, blocked host — are exactly what the user needs told
    immediately and can act on), while parse + vision + embed move to the
    background job, since a PDF URL runs vision over every page and would
    outlast any client timeout. Returns 202 + job_id like rag_upload; the KB
    screen already polls ingestion jobs, so progress shows up the same way.

    All fetching lives in app/orchestra/ai/ingestion/scraper/ — including the
    SSRF guard and redirect handling. This endpoint only translates a
    ScrapeError into an HTTP response.
    """
    from app.models.ingestion_job import IngestionJob
    from app.orchestra.ai.ingestion.jobs import get_job_runner
    from app.orchestra.ai.ingestion.scraper import (
        discard_preview, fetch_url, load_preview, preview_token_mode, ScrapeError,
    )

    kb_id = await _resolve_kb_id(req.kb_id, org, db)
    url = req.url.strip()

    # Prefer the previewed bytes when the caller has a token: guarantees the
    # indexed content is exactly what they approved, and skips a second fetch.
    # A stale/foreign/expired Quick token falls through to a fresh fetch for
    # backward compatibility. Deep mode must fail instead: a quick re-fetch
    # could differ materially from the rendered content the user approved.
    page = load_preview(req.preview_token or "", str(org.id))
    if page is not None:
        discard_preview(req.preview_token or "")
    else:
        token_mode = preview_token_mode(req.preview_token or "")
        if token_mode == "deep" or req.preview_mode == "deep":
            raise HTTPException(
                status_code=409,
                detail="Deep Preview expired. Generate it again before adding.",
            )
        try:
            page = await fetch_url(url, mode="quick")
        except ScrapeError as e:
            raise HTTPException(status_code=e.status_hint, detail=str(e))

    raw_bytes = page.raw
    filename = page.filename
    doc_type = req.doc_type if req.doc_type in VALID_DOC_TYPES else "general"
    # What citations will read as: the page title for HTML, else the URL —
    # "page.pdf" would be meaningless to a customer reading a citation. A
    # scraper-recovered title (e.g. a flipbook's bookTitle) is a real name,
    # so keep it over the URL; a bare hostname is not.
    user_title = (req.title or "").strip()
    display_name = (
        user_title or (page.title if filename == "page.html" or " " in page.title else page.final_url)
    )[:200]

    # Same disk hand-off as file uploads: the payload must survive this request
    # and, under the Celery backend, cross a process boundary. The task no
    # longer deletes it when it finishes.
    tmp_dir = Path("uploads").absolute()
    tmp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = tmp_dir / f"{uuid.uuid4().hex}_{filename}"
    temp_path.write_bytes(raw_bytes)

    job_row = IngestionJob(
        space_id=org.id,
        kb_id=uuid.UUID(kb_id) if kb_id else None,
        filename=display_name,
        doc_type=doc_type,
        kb_name=req.kb_name or None,
        source="url",          # progress belongs under the KB's URLs tab
        status="queued",
        progress=0,
        stage_detail="Waiting to start",
    )
    db.add(job_row)
    await db.commit()
    await db.refresh(job_row)

    # Replayable task args (see rag_upload). `url` sits alongside the task
    # kwargs, not inside them: on retry, if the temp bytes are gone (the task
    # deletes them on a genuine failure), the URL job can re-fetch rather than
    # making the user start over — file uploads have no such escape hatch.
    enable_enrichment: bool = True
    if x_contextual_enrichment is not None:
        enable_enrichment = x_contextual_enrichment.strip().lower() in ("true", "1", "yes", "on")


    task_kwargs = dict(
        job_id=str(job_row.id),
        space_id=str(org.id),
        temp_path=str(temp_path),
        filename=filename,            # drives parser selection (extension)
        display_name=display_name,    # what citations show
        doc_type=doc_type,
        session_id=str(uuid.uuid4()),
        kb_name=req.kb_name or "",
        description=req.description or url,
        expiry_date="",
        org_name=org.display_name or "",
        kb_id=kb_id or "",
        item_title=user_title or display_name,

        # Listed under the KB's "URL" tab rather than "Documents", and the
        # source URL is kept so the row can link back to the live page.
        item_type="url",
        source_url=page.final_url,
        topic=req.topic or "",
        doc_label=req.doc_label or "",
        enable_enrichment=enable_enrichment,
    )

    job_row.retry_payload = {"task": task_kwargs, "url": url}
    await db.commit()
    await db.refresh(job_row)

    get_job_runner().enqueue("ingest_document", **task_kwargs)

    logger.info("ingestion.job.queued", job_id=str(job_row.id), source="url",
                url=url, kb_id=kb_id, space_id=str(org.id))
    return RagUploadAcceptedResponse(
        job_id=str(job_row.id),
        filename=display_name,
        status=job_row.status,
        message=f"Fetched '{url}' — indexing in the background.",
    )


# Made with Bob

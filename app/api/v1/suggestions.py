"""
Suggestions API — Dedicated endpoint module for AI metadata suggestions and term completions.
"""

from typing import List, Optional
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import current_space, current_space_optional

logger = structlog.get_logger()
router = APIRouter(prefix="/suggestions", tags=["Suggestions"])


# ── Metadata Suggestions Models ───────────────────────────────────────────────

class SuggestMetadataRequest(BaseModel):
    doc_id: Optional[str] = None
    item_id: Optional[str] = None
    filename: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    content: Optional[str] = None


class SuggestMetadataResponse(BaseModel):
    doc_type: Optional[str] = None
    scope: Optional[str] = None
    description: str
    topic: str
    tags: List[str] = []


# ── Term Suggestions Models ───────────────────────────────────────────────────

class TermSuggestion(BaseModel):
    word: str


class SuggestTermsResponse(BaseModel):
    terms: List[TermSuggestion]


from fastapi import APIRouter, Depends, File, Form, UploadFile, Request

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/metadata", response_model=SuggestMetadataResponse)
@router.post("/doc-metadata", response_model=SuggestMetadataResponse)
async def suggest_doc_metadata(
    request: Request,
    file: Optional[UploadFile] = File(None),
    doc_id: Optional[str] = Form(None),
    item_id: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    org=Depends(current_space_optional),
):
    """
    Generate AI-suggested description and topic tag.
    - If a new file is uploaded (file field), parses PDF/DOCX/TXT bytes on the fly and extracts text chunks.
    - If doc_id/item_id is supplied, pulls starting 20 chunks from ChromaDB vector store.
    - Also accepts JSON body (SuggestMetadataRequest).
    """
    from app.utils.ai.doc_meta_suggestion import generate_doc_metadata_suggestion

    space_id = str(org.id) if org else None

    file_bytes: Optional[bytes] = None
    file_name: Optional[str] = filename

    # Handle JSON payload if content-type is application/json
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            doc_id = body.get("doc_id") or doc_id
            item_id = body.get("item_id") or item_id
            file_name = body.get("filename") or file_name
            title = body.get("title") or title
            url = body.get("url") or url
            content = body.get("content") or content
        except Exception:
            pass

    if file:
        file_bytes = await file.read()
        file_name = file.filename or file_name

    result = await generate_doc_metadata_suggestion(
        space_id=space_id,
        doc_id=doc_id or item_id,
        file_bytes=file_bytes,
        filename=file_name,
        title=title,
        url=url,
        content=content,
    )
    return SuggestMetadataResponse(
        doc_type=result.get("doc_type", ""),
        scope=result.get("scope", ""),
        description=result.get("description", ""),
        topic=result.get("topic", ""),
        tags=result.get("tags", []),
    )


@router.get("/terms", response_model=SuggestTermsResponse)
async def suggest_terms(query: str, org=Depends(current_space_optional)):
    """
    Fetch online term completions from Datamuse API (configured via DATAMUSE_API_URL in .env).
    """
    import httpx
    from app.config import settings

    q = query.strip()
    if not q or len(q) < 2:
        return SuggestTermsResponse(terms=[])

    try:
        url = getattr(settings, "DATAMUSE_API_URL", "https://api.datamuse.com/words")
        async with httpx.AsyncClient(timeout=4.0) as client:
            pattern = "*".join(q.split()) + "*"
            res = await client.get(url, params={"sp": pattern, "max": 10})
            data = res.json() if res.status_code == 200 else []

            # Fallback to direct prefix wildcard if needed
            if len(data) < 3 and " " in q:
                res_alt = await client.get(url, params={"sp": f"{q}*", "max": 10})
                if res_alt.status_code == 200:
                    existing = {i["word"].lower() for i in data if "word" in i}
                    for i in res_alt.json():
                        if i.get("word") and i["word"].lower() not in existing:
                            data.append(i)
                            existing.add(i["word"].lower())

            terms = [TermSuggestion(word=item["word"]) for item in data if "word" in item]
            return SuggestTermsResponse(terms=terms[:10])
    except Exception as exc:
        logger.warning(f"Datamuse term suggestion failed for '{q}': {exc}")

    return SuggestTermsResponse(terms=[])

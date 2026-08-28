import logging
import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete

from app.api.auth import current_space
from app.core.database import get_db, AsyncSessionLocal
from app.core.redis import get_redis, RedisClient
from app.rag.vector_store import get_vector_store
from app.orchestra.ai.facts.schemas import RawChunk, ExtractedFact
from app.orchestra.ai.facts.extractor_v2 import FactEngine
from app.orchestra.ai.facts.auditor import FactAuditor
from app.orchestra.ai.facts.session import sync_chat_history
from app.config import settings
from app.models.kb_fact import KBFact
from app.models.knowledge_base import KnowledgeBaseItem

import httpx
import fitz
import tempfile
import os

logger = logging.getLogger(__name__)
router = APIRouter()

class ExtractV2Request(BaseModel):
    feedback: Optional[str] = None

class ExtractV2Response(BaseModel):
    status: str
    facts: Optional[List[ExtractedFact]] = None
    progress: Optional[int] = None
    total: Optional[int] = None
    eta_seconds: Optional[int] = None
    message: Optional[str] = None
    chat_history: Optional[List[dict]] = None
    saved_facts: Optional[List[ExtractedFact]] = None
    hierarchy_tree: Optional[dict] = None

class SyncChatRequest(BaseModel):
    chat_history: List[dict]

class CommitV2Request(BaseModel):
    facts: List[ExtractedFact]

class VerifyV2Request(BaseModel):
    facts: List[ExtractedFact]
    feedback: Optional[str] = None


def _get_redis_key(doc_id: str) -> str:
    return f"v2_facts:{doc_id}"


async def _update_redis_state(doc_id: str, updates: dict):
    redis = await get_redis()
    key = _get_redis_key(doc_id)
    state = await redis.get(key)
    if not state:
        state = {}
    elif isinstance(state, str):
        state = json.loads(state)
    state.update(updates)
    await redis.set(key, json.dumps(state))


async def _run_v2_extraction_background(
    kb_id: str,
    doc_id: str,
    space_id: str,
    feedback: Optional[str]
):
    try:
        redis = await get_redis()
        
        async def _set_msg(msg: str):
            logger.info(f"Fact extraction progress: {msg}", extra={"doc_id": doc_id})
            await _update_redis_state(doc_id, {"status": "processing", "message": msg})
            
        mapped_chunks = []
        is_url_source = False

        await _set_msg("Loading document source...")

        # 1. Check for raw parsed JSON cache on disk first (from ingestion pipeline)
        cache_path = os.path.join("uploads", "raw_ingestion_json", f"{doc_id}.json")
        if os.path.exists(cache_path):
            await _set_msg("Loading pre-parsed document cache...")
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    parsed_data = json.load(f)
                    for p in parsed_data.get("pages", []):
                        mapped_chunks.append(
                            RawChunk(
                                text=p.get("text", ""), 
                                metadata={"page": p.get("page", 0)}, 
                                is_table_row=False
                            )
                        )
                is_url_source = True
                logger.info(f"Loaded {len(mapped_chunks)} chunks from fast disk cache", extra={"doc_id": doc_id})
            except Exception as e:
                logger.exception("Failed to load parsed document cache from disk", extra={"doc_id": doc_id})
                # Fall through to original methods if this fails

        # 2. Try to fetch original document source if it's a URL or a saved local file
        if not is_url_source:
            try:
                async with AsyncSessionLocal() as db:
                    stmt = select(KnowledgeBaseItem).where(KnowledgeBaseItem.doc_id == doc_id)
                    result = await db.execute(stmt)
                    kb_item = result.scalar_one_or_none()
                    
                    if kb_item and kb_item.content:
                        source_content = kb_item.content.strip()
                        
                        if kb_item.item_type == "url" and source_content.startswith("http"):
                            await _set_msg("Downloading URL source...")
                            logger.info(f"Extracting directly from URL source: {source_content}")
                            async with httpx.AsyncClient() as client:
                                resp = await client.get(source_content, follow_redirects=True)
                                if resp.status_code == 200 and resp.content:
                                    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                                        tmp.write(resp.content)
                                        tmp_path = tmp.name
                                    await _set_msg("Parsing downloaded PDF pages...")
                                    try:
                                        doc = fitz.open(tmp_path)
                                        for i, page in enumerate(doc):
                                            text = page.get_text()
                                            if text.strip():
                                                mapped_chunks.append(
                                                    RawChunk(text=text, metadata={"page": i}, is_table_row=False)
                                                )
                                        is_url_source = True
                                    finally:
                                        os.unlink(tmp_path)
                        
                        elif kb_item.item_type == "file" and source_content.startswith("file://"):
                            local_path = source_content.replace("file://", "", 1)
                            if os.path.exists(local_path):
                                await _set_msg("Parsing local PDF file...")
                                logger.info(f"Extracting directly from local file: {local_path}")
                                try:
                                    doc = fitz.open(local_path)
                                    for i, page in enumerate(doc):
                                        text = page.get_text()
                                        if text.strip():
                                            mapped_chunks.append(
                                                RawChunk(text=text, metadata={"page": i}, is_table_row=False)
                                            )
                                    is_url_source = True
                                except Exception as e:
                                    logger.exception("Failed to parse local file")
            except Exception as e:
                logger.exception("Failed to fetch original URL source")

        # 3. Fallback to vector store chunks if not a URL and cache wasn't found
        if not is_url_source:
            await _set_msg("Fetching chunked vector data...")
            raw_chunks = await redis.get(f"chunks:{doc_id}")
            if not raw_chunks:
                # Need chunks
                await _update_redis_state(doc_id, {"status": "failed", "error": "No chunks found and source document unavailable."})
                return
            
            raw_chunks = json.loads(raw_chunks) if isinstance(raw_chunks, str) else raw_chunks
            mapped_chunks = [
                RawChunk(
                    text=c.get("document") or c.get("text") or "",
                    metadata=c.get("metadata") or {}
                )
                for c in raw_chunks
            ]

        await _set_msg("Connecting to AI extraction engine...")
        # Setup LLM
        from app.core.llm_provider import get_async_openai_clients
        from app.config import settings
        providers = get_async_openai_clients(override_model=settings.FACT_FINDER_MODEL)
        if not providers:
            await _update_redis_state(doc_id, {"status": "failed", "error": "No LLM API key configured for OpenAI or OpenRouter"})
            return
            
        facts = None
        last_error = None
        
        # Extract with fallback
        async def _progress_cb(current_batch: int, total_batches: int):
            # We assume ~20 seconds per batch for ETA
            eta_seconds = (total_batches - current_batch) * 20
            msg = f"Analyzing batch {current_batch + 1} of {total_batches}..."
            await _update_redis_state(doc_id, {
                "status": "processing",
                "progress": current_batch,
                "total": total_batches,
                "eta_seconds": eta_seconds,
                "message": msg
            })
            
        errors = {}
        for name, client, model in providers:
            try:
                logger.info(f"Using {name} - {model}")
                engine = FactEngine(client=client, model=model)
                facts = await engine.extract(
                    chunks=mapped_chunks, 
                    strategy="full_document", 
                    feedback=feedback,
                    progress_callback=_progress_cb
                )
                break
            except Exception as e:
                logger.exception(f"Fact extraction failed with provider {name}", extra={"doc_id": doc_id})
                
                # Extract clean error message
                error_msg = str(e)
                if hasattr(e, "response"):
                    try:
                        resp_json = e.response.json()
                        if isinstance(resp_json, dict) and "error" in resp_json and "message" in resp_json["error"]:
                            error_msg = resp_json["error"]["message"]
                    except:
                        pass
                
                errors[name] = error_msg
                
        if facts is None:
            formatted_errors = " | ".join([f"{name.capitalize()}: {err}" for name, err in errors.items()])
            raise Exception(f"All providers failed -> {formatted_errors}")

        await _set_msg("Finalizing and saving extracted facts...")
        # Save to redis
        facts_dicts = [f.model_dump() for f in facts]
        await _update_redis_state(doc_id, {
            "status": "completed",
            "facts": facts_dicts
        })
        
        # Save to Postgres permanent cache
        # We save unverified facts here so they aren't lost on Redis restarts.
        # They will be formally converted to KBFact records if the user hits "Commit".
        try:
            logger.info(f"Saving {len(facts_dicts)} extracted facts to Postgres permanent cache.", extra={"doc_id": doc_id})
            async with AsyncSessionLocal() as db:
                stmt = select(KnowledgeBaseItem).where(KnowledgeBaseItem.doc_id == doc_id)
                result = await db.execute(stmt)
                kb_item = result.scalar_one_or_none()
                if kb_item:
                    kb_item.extracted_facts = facts_dicts
                    await db.commit()
                    logger.info("Successfully saved extracted facts to Postgres.", extra={"doc_id": doc_id})
                else:
                    logger.warning("Document not found in database; skipping Postgres cache.", extra={"doc_id": doc_id})
        except Exception as e:
            logger.exception("Failed to cache extracted facts in Postgres", extra={"doc_id": doc_id})

    except Exception as e:
        logger.exception("Background extraction failed")
        await _update_redis_state(doc_id, {"status": "failed", "error": str(e)})


@router.post("/space/knowledge-bases/{kb_id}/documents/{doc_id}/extract-v2")
async def start_extract_facts_v2(
    kb_id: str,
    doc_id: str,
    background_tasks: BackgroundTasks,
    req: Optional[ExtractV2Request] = None,
    space=Depends(current_space),
    redis: RedisClient = Depends(get_redis),
    db: AsyncSession = Depends(get_db)
):
    """Start background extraction of facts."""
    feedback = req.feedback if req else None
    
    # 1. Check Redis (fast ephemeral cache)
    data = await redis.get(_get_redis_key(doc_id))
    if data:
        parsed = data if isinstance(data, dict) else json.loads(data)
        if parsed.get("status") == "processing":
            logger.info("Extraction already in progress in Redis cache.", extra={"doc_id": doc_id})
            return {"status": "processing"}
        # If it's 'completed' or 'failed', and the user is POSTing here, they are forcing a regeneration.
        logger.info("Existing extraction found, but starting a new one (Regenerate).", extra={"doc_id": doc_id})
        
    # If the user makes a POST request here, they explicitly want to start a new extraction.
    # We bypass the Postgres cache check here because the GET status endpoint already
    # handles Postgres cache restoration. If they hit POST, it means either the cache
    # was empty or they clicked 'Regenerate'.
    
    logger.info("No cached facts found. Starting new extraction task.", extra={"doc_id": doc_id})
    # Set immediate status
    await _update_redis_state(doc_id, {"status": "processing"})
    
    # Enqueue task
    background_tasks.add_task(
        _run_v2_extraction_background,
        kb_id=kb_id,
        doc_id=doc_id,
        space_id=str(space.id),
        feedback=feedback
    )
    return {"status": "processing"}


@router.get("/space/knowledge-bases/{kb_id}/documents/{doc_id}/extract-v2", response_model=ExtractV2Response)
async def get_extraction_status(kb_id: str, doc_id: str, db: AsyncSession = Depends(get_db)):
    redis = await get_redis()
    state = await redis.get(_get_redis_key(doc_id))
    
    # Always fetch kb_item to get the committed facts if they exist
    saved_facts = None
    try:
        kb_item = (await db.execute(
            select(KnowledgeBaseItem).where(KnowledgeBaseItem.doc_id == doc_id)
        )).scalar_one_or_none()
        
        if kb_item and kb_item.extracted_facts:
            saved_facts = [ExtractedFact(**f) for f in kb_item.extracted_facts]
    except Exception as e:
        logger.exception("Failed to fetch saved facts from DB")
        
    if not state:
        if saved_facts:
            logger.info("Restoring unverified facts from Postgres to UI after Redis miss.", extra={"doc_id": doc_id})
            return ExtractV2Response(status="completed", facts=saved_facts, saved_facts=saved_facts)
        return ExtractV2Response(status="none")

    try:
        parsed = state if isinstance(state, dict) else json.loads(state)
        return ExtractV2Response(
            status=parsed.get("status", "none"),
            facts=[ExtractedFact(**f) for f in parsed.get("facts", [])] if "facts" in parsed else None,
            progress=parsed.get("progress"),
            total=parsed.get("total"),
            eta_seconds=parsed.get("eta_seconds"),
            message=parsed.get("message"),
            chat_history=parsed.get("chat_history"),
            saved_facts=saved_facts,
            hierarchy_tree=parsed.get("hierarchy_tree")
        )
    except Exception as e:
        return ExtractV2Response(status="failed")

@router.post("/space/knowledge-bases/{kb_id}/documents/{doc_id}/extract-v2/chat")
async def update_extraction_chat(kb_id: str, doc_id: str, req: SyncChatRequest):
    await sync_chat_history(doc_id, req.chat_history)
    return {"status": "ok"}


@router.post("/space/knowledge-bases/{kb_id}/documents/{doc_id}/extract-v2/commit")
async def commit_extracted_facts(
    kb_id: str,
    doc_id: str,
    req: CommitV2Request,
    space=Depends(current_space),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis)
):
    """Commit verified facts to the main database and clear redis cache."""
    created = []
    
    # Check if doc exists in KB (security)
    owns = (await db.execute(
        select(KnowledgeBaseItem).where(
            KnowledgeBaseItem.kb_id == kb_id,
            KnowledgeBaseItem.doc_id == doc_id
        )
    )).scalar_one_or_none()
    if not owns:
        raise HTTPException(404, "Document not found in this knowledge base.")

    # Delete existing KBFact records for this document to prevent duplicates on multiple saves
    await db.execute(delete(KBFact).where(KBFact.source_doc_id == doc_id))

    # Convert schema to DB model
    fact_dicts = []
    for p in req.facts:
        fact = KBFact(
            kb_id=kb_id, 
            space_id=space.id, 
            verified=True, 
            subject=p.subject,
            label=p.label,
            value=p.value,
            note=p.note,
            source_doc_id=doc_id
        )
        fact_dicts.append(p.model_dump())
        db.add(fact)
        created.append(fact)

    owns.extracted_facts = fact_dicts
    await db.commit()
    
    return {"status": "success", "committed": len(created)}


@router.post("/space/knowledge-bases/{kb_id}/documents/{doc_id}/extract-v2/verify", response_model=ExtractV2Response)
async def verify_extracted_facts(
    kb_id: str,
    doc_id: str,
    req: VerifyV2Request,
    space=Depends(current_space),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis)
):
    """Run an agentic verification pass to clean, deduplicate, and sanitize extracted facts."""
    if not req.facts:
        return ExtractV2Response(status="completed", facts=[])
        
    from app.core.llm_provider import get_async_openai_clients
    providers = get_async_openai_clients(override_model=settings.FACT_VERIFIER_MODEL or "gpt-4o")
    if not providers:
        raise HTTPException(500, "No LLM API key configured for verification")
        
    cleaned_facts = None
    errors = {}
    
    for name, client, model in providers:
        try:
            logger.info(f"Using {name} - {model} for verification")
            auditor = FactAuditor(client=client, model=model)
            cleaned_facts, explanation = await auditor.verify(facts=req.facts, feedback=req.feedback)
            break
        except Exception as e:
            logger.exception(f"Fact verification failed with provider {name}", extra={"doc_id": doc_id})
            errors[name] = str(e)
            
    if cleaned_facts is None:
        formatted_errors = " | ".join([f"{name.capitalize()}: {err}" for name, err in errors.items()])
        raise HTTPException(500, f"Verification failed -> {formatted_errors}")
        
    facts_dicts = [f.model_dump() for f in cleaned_facts]
    
    # Update Redis
    await _update_redis_state(doc_id, {
        "status": "completed",
        "facts": facts_dicts
    })
    
    # Update Postgres Cache
    try:
        kb_item = (await db.execute(
            select(KnowledgeBaseItem).where(KnowledgeBaseItem.doc_id == doc_id)
        )).scalar_one_or_none()
        if kb_item:
            kb_item.extracted_facts = facts_dicts
            await db.commit()
    except Exception:
        logger.exception("Failed to update Postgres cache with verified facts")
        
    return ExtractV2Response(status="completed", facts=cleaned_facts, message=explanation)

@router.post("/space/knowledge-bases/{kb_id}/documents/{doc_id}/extract-v2/graphify", response_model=ExtractV2Response)
async def graphify_extracted_facts(
    kb_id: str,
    doc_id: str,
    req: VerifyV2Request,
    space=Depends(current_space),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis)
):
    """Run an agentic pass to build a hierarchy graph and cluster aliases."""
    if not req.facts:
        return ExtractV2Response(status="completed", facts=[])
        
    from app.orchestra.ai.facts.hierarchy.builder import build_hierarchy_tree, apply_hierarchy_to_facts
    
    # 1. Extract unique subjects
    unique_subjects = list(set([f.subject for f in req.facts if f.subject]))
    
    # 2. Build Tree
    tree = await build_hierarchy_tree(unique_subjects)
    
    # 3. Apply Tree
    updated_facts = apply_hierarchy_to_facts(req.facts, tree)
    
    facts_dicts = [f.model_dump() for f in updated_facts]
    
    # Update Redis
    await _update_redis_state(doc_id, {
        "status": "completed",
        "facts": facts_dicts,
        "hierarchy_tree": tree.model_dump() if tree else None
    })
    
    # Update Postgres Cache
    try:
        kb_item = (await db.execute(
            select(KnowledgeBaseItem).where(KnowledgeBaseItem.doc_id == doc_id)
        )).scalar_one_or_none()
        if kb_item:
            kb_item.extracted_facts = facts_dicts
            await db.commit()
    except Exception:
        logger.exception("Failed to update Postgres cache with graphified facts")
        
    message = (
        "I have generated the product hierarchy graph and mapped the aliases in the table to their canonical names. "
        "Here is the raw generated JSON tree:\n\n```json\n" + 
        tree.model_dump_json(indent=2) + 
        "\n```"
    )
        
    return ExtractV2Response(
        status="completed", 
        facts=updated_facts, 
        message=message,
        hierarchy_tree=tree.model_dump() if tree else None
    )

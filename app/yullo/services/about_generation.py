import logging
import json
import hashlib
from typing import Optional, Dict, Any, List
import uuid
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.llm_provider import get_async_openai_clients
from app.models.space import Space
from app.models.knowledge_base import KnowledgeBaseItem, KnowledgeBase

logger = logging.getLogger(__name__)

async def collect_about_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    space_id: Optional[uuid.UUID] = None,
    draft_website: Optional[str] = None
) -> Dict[str, Any]:
    """
    Server-side resolution of space identity, ownership, and verified public sources.
    Never trusts client-supplied source lists or client excerpt text.
    """
    logger.info(f"collect_about_context: user_id={user_id}, space_id={space_id}")
    
    target_space: Optional[Space] = None
    
    if space_id:
        # Check ownership explicitly for target space
        stmt = select(Space).where(Space.id == space_id, Space.owner_user_id == user_id)
        target_space = await db.scalar(stmt)
    else:
        # Resolve active draft space for user
        stmt = select(Space).where(Space.owner_user_id == user_id, Space.status == "draft").order_by(Space.created_at.desc())
        target_space = await db.scalar(stmt)

    if not target_space:
        logger.warning(f"collect_about_context: No valid space found for user {user_id} (space_id={space_id})")
        return {
            "space_name": "",
            "space_type": "",
            "excerpts": [],
            "found_space": False
        }

    space_name = target_space.display_name or ""
    space_type = target_space.purpose or "business"
    
    # Query verified public KnowledgeBaseItems for this space
    # Find primary KB for the space first if available
    kb_stmt = select(KnowledgeBase).where(KnowledgeBase.space_id == target_space.id)
    kb = await db.scalar(kb_stmt)
    
    excerpts: List[Dict[str, str]] = []
    
    if kb:
        items_stmt = select(KnowledgeBaseItem).where(
            and_(
                KnowledgeBaseItem.kb_id == kb.id,
                KnowledgeBaseItem.ingestion_status.in_(["ready", "completed", "indexed", None])
            )
        ).order_by(KnowledgeBaseItem.created_at.desc()).limit(settings.YULLO_ABOUT_MAX_EXCERPTS)
        
        items = (await db.scalars(items_stmt)).all()
        for item in items:
            text_content = (item.content or item.description or "").strip()
            if text_content:
                excerpts.append({
                    "source_id": str(item.id),
                    "title": item.title or item.doc_id or "Source",
                    "text": text_content[:1000] # Cap per-excerpt text
                })

    # If draft website URL is provided during onboarding, include it as reference if no excerpts exist yet
    if not excerpts and draft_website and draft_website.strip():
        excerpts.append({
            "source_id": "draft-website",
            "title": "Owner Website",
            "text": f"Website address: {draft_website.strip()}"
        })

    return {
        "space_name": space_name,
        "space_type": space_type,
        "excerpts": excerpts,
        "found_space": True,
        "space_id": target_space.id
    }

def validate_about_context(context: Dict[str, Any]) -> bool:
    """
    Ensures context is available. Space name and type are sufficient for baseline generation,
    and source excerpts provide rich factual grounding when present.
    """
    space_name = (context.get("space_name") or "").strip()
    excerpts = context.get("excerpts", [])
    if space_name or len(excerpts) > 0:
        return True
        
    logger.info("validate_about_context: Insufficient context (no space name or excerpts)")
    return False

def build_about_prompt(context: Dict[str, Any]) -> Tuple[List[Dict[str, str]], str]:
    """
    Builds system and user prompts for About generation.
    """
    space_name = context.get("space_name", "")
    space_type = context.get("space_type", "")
    excerpts = context.get("excerpts", [])
    
    excerpts_text = ""
    for idx, e in enumerate(excerpts, start=1):
        excerpts_text += f"\n[Source {idx} - {e.get('title')}]: {e.get('text')}\n"

    if excerpts:
        system_prompt = (
            "You are Aura, an AI assistant for Yullo spaces. Your task is to write a concise, compelling, "
            "and factually accurate 'About' description for a Space based STRICTLY on the provided source excerpts.\n\n"
            "RULES:\n"
            "1. Do NOT invent, assume, or extrapolate facts not present in the sources.\n"
            "2. Keep the description clear, professional, and under 280 characters.\n"
            "3. Output MUST be valid JSON with fields:\n"
            "   - 'description': String (max 280 chars summary)\n"
            "   - 'claims': List of Strings (key facts extracted from sources)\n"
            "   - 'clarification': String or null\n"
        )
        user_prompt = (
            f"Space Name: {space_name}\n"
            f"Space Type: {space_type}\n"
            f"Source Excerpts:{excerpts_text}\n\n"
            "Write the grounded About description in valid JSON format."
        )
    else:
        system_prompt = (
            "You are Aura, an AI assistant for Yullo spaces. Your task is to write a clean, professional, "
            "and concise 'About' description for a Space based on its name and purpose.\n\n"
            "RULES:\n"
            "1. Write a clean, natural summary under 280 characters.\n"
            "2. Output MUST be valid JSON with fields:\n"
            "   - 'description': String (max 280 chars summary)\n"
            "   - 'claims': List of Strings\n"
            "   - 'clarification': String or null\n"
        )
        user_prompt = (
            f"Space Name: {space_name}\n"
            f"Space Type: {space_type}\n\n"
            "Write the About description in valid JSON format."
        )
    
    # Calculate input fingerprint
    raw_fingerprint = f"{space_name}:{space_type}:{excerpts_text}"
    input_fingerprint = hashlib.sha256(raw_fingerprint.encode("utf-8")).hexdigest()[:16]
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    return messages, input_fingerprint

async def generate_about_candidate(messages: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    """
    Invokes LLM provider fallback chain (OpenAI -> OpenRouter -> others) via get_async_openai_clients.
    Ensures provider-specific model formatting and handles failures gracefully.
    """
    clients = get_async_openai_clients(override_model=settings.YULLO_ABOUT_MODEL)
    if not clients:
        logger.error("generate_about_candidate: No configured LLM providers available.")
        return None
        
    for provider_name, client, model_name in clients:
        try:
            logger.info(f"Attempting About description generation with provider={provider_name}, model={model_name}")
            
            kwargs: Dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
                "timeout": settings.YULLO_ABOUT_TIMEOUT_SECONDS
            }
            
            # reasoning_effort check for models that support it
            if settings.YULLO_ABOUT_REASONING_EFFORT and "gpt-5" in model_name.lower():
                kwargs["reasoning_effort"] = settings.YULLO_ABOUT_REASONING_EFFORT

            response = await client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content
            if content:
                parsed = json.loads(content)
                return parsed
        except Exception as e:
            logger.warning(f"generate_about_candidate failed with provider={provider_name}, model={model_name}: {e}")
            continue
            
    return None

def validate_about_candidate(candidate: Dict[str, Any]) -> bool:
    """
    Validates that candidate contains valid description within character limits.
    """
    if not isinstance(candidate, dict):
        return False
        
    desc = candidate.get("description")
    if not desc or not isinstance(desc, str) or not desc.strip():
        return False
        
    if len(desc.strip()) > settings.YULLO_ABOUT_MAX_CHARACTERS + 20: # Allow slight buffer
        logger.warning(f"validate_about_candidate: Output exceeded max characters ({len(desc)} > {settings.YULLO_ABOUT_MAX_CHARACTERS})")
        return False
        
    return True

async def suggest_about(
    db: AsyncSession,
    user_id: uuid.UUID,
    space_id: Optional[uuid.UUID] = None,
    draft_website: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entry point for generating About suggestion server-side.
    Returns structured result dict with status: 'ready', 'insufficient_context', or 'unavailable'.
    """
    try:
        context = await collect_about_context(db, user_id=user_id, space_id=space_id, draft_website=draft_website)
        
        if not context.get("found_space"):
            return {
                "status": "insufficient_context",
                "description": None,
                "claims": [],
                "clarification": "No active space or draft found.",
                "prompt_version": settings.YULLO_ABOUT_PROMPT_VERSION,
                "input_fingerprint": None
            }
            
        if not validate_about_context(context):
            return {
                "status": "insufficient_context",
                "description": None,
                "claims": [],
                "clarification": "Space name and purpose give Aura a title. Add a website link or document under 'Give Aura a head start' to generate a rich, grounded description.",
                "prompt_version": settings.YULLO_ABOUT_PROMPT_VERSION,
                "input_fingerprint": None
            }
            
        messages, input_fingerprint = build_about_prompt(context)
        candidate = await generate_about_candidate(messages)
        
        if not candidate or not validate_about_candidate(candidate):
            return {
                "status": "unavailable",
                "description": None,
                "claims": [],
                "clarification": "Generation service is currently unavailable.",
                "prompt_version": settings.YULLO_ABOUT_PROMPT_VERSION,
                "input_fingerprint": input_fingerprint
            }
            
        return {
            "status": "ready",
            "description": candidate.get("description", "").strip(),
            "claims": candidate.get("claims", []),
            "clarification": candidate.get("clarification"),
            "prompt_version": settings.YULLO_ABOUT_PROMPT_VERSION,
            "input_fingerprint": input_fingerprint
        }
    except Exception as e:
        logger.error(f"Error in suggest_about: {e}", exc_info=True)
        return {
            "status": "unavailable",
            "description": None,
            "claims": [],
            "clarification": "Generation failed due to internal error.",
            "prompt_version": settings.YULLO_ABOUT_PROMPT_VERSION,
            "input_fingerprint": None
        }

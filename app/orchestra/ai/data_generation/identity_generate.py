import logging
import json
import hashlib
from typing import Optional, Dict, Any, List, Tuple
import uuid
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.llm_provider import get_async_openai_clients
from app.models.space import Space
from app.models.knowledge_base import KnowledgeBaseItem, KnowledgeBase
from app.models.yullo_source import YulloSource
from app.models.yullo_config import YulloConfig

logger = logging.getLogger(__name__)

PROMPT_VERSION = "identity-v4-owner-draft"

async def collect_about_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    space_id: Optional[uuid.UUID] = None,
    draft_website: Optional[str] = None,
    override_name: Optional[str] = None,
    client_sources: Optional[List[dict]] = None,
    user_message: Optional[str] = None,
    draft_purpose: Optional[str] = None,
    draft_category: Optional[str] = None,
    category_source: Optional[str] = None,
    draft_presence: Optional[str] = None,
    draft_description: Optional[str] = None,
    description_source: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Server-side resolution of space identity, ownership, and all available knowledge sources.
    Aggregates space name, purpose, owner description, and confirmed KnowledgeBaseItems/YulloSources.
    Enforces strict filtering: same Space, current source version, successful ingestion, is_confirmed = True.
    """
    logger.info("yullo.identity.context", extra={"user_id": str(user_id), "space_id": str(space_id) if space_id else None})
    
    target_space: Optional[Space] = None
    
    if space_id:
        # Check ownership explicitly for target space
        stmt = select(Space).where(Space.id == space_id, Space.owner_user_id == user_id, Space.product == "yullo")
        target_space = await db.scalar(stmt)
    else:
        # Resolve active draft space for user
        stmt = select(Space).where(Space.owner_user_id == user_id, Space.product == "yullo", Space.status == "draft").order_by(Space.created_at.desc())
        target_space = await db.scalar(stmt)

    if (space_id and not target_space) or (not target_space and not override_name):
        logger.warning(f"collect_about_context: No valid space found for user {user_id} (space_id={space_id})")
        return {
            "space_name": "",
            "space_type": "",
            "owner_description": "",
            "excerpts": [],
            "found_space": False,
            "space_id": None
        }

    # Resolve Space Name: priority to explicit override_name, then display_name
    space_name = (override_name or "").strip()
    if not space_name and target_space:
        space_name = target_space.display_name or ""
        
    space_type = target_space.purpose if target_space else "business"
    resolved_space_id = target_space.id if target_space else space_id

    identity_settings = {}
    if resolved_space_id:
        yullo_config = await db.scalar(select(YulloConfig).where(YulloConfig.space_id == resolved_space_id))
        identity_settings = (yullo_config.settings or {}).get("identity", {}) if yullo_config else {}
    space_type = draft_purpose if draft_purpose is not None else space_type
    category = draft_category if draft_category is not None else identity_settings.get("category", "")
    category_provenance = category_source if category_source is not None else identity_settings.get("category_source", "owner")
    description = draft_description if draft_description is not None else identity_settings.get("description", "")
    description_provenance = description_source if description_source is not None else identity_settings.get("description_source", "owner")
    owner_category = (category or "").strip() if category_provenance != "aura" else ""
    owner_description = (description or "").strip() if description_provenance != "aura" else ""
    presence = draft_presence if draft_presence is not None else identity_settings.get("presence", "")
    previous_description = (description or "").strip() if description_provenance == "aura" else ""
    previous_category = (category or "").strip() if category_provenance == "aura" else ""

    excerpts: List[Dict[str, Any]] = []
    seen_source_ids = set()

    def add_excerpt(source_id: str, title: str, text: str, url: str = "", version: int = 1, facts: List[str] = None):
        cleaned_text = (text or "").strip()
        sid = str(source_id)
        if sid not in seen_source_ids and (cleaned_text or facts):
            seen_source_ids.add(sid)
            excerpts.append({
                "source_id": sid,
                "title": title or "Source",
                "url": url,
                "source_version": version,
                "text": cleaned_text[:1000],
                "facts": facts or []
            })

    if resolved_space_id:
        # 1. Query KnowledgeBaseItems for this space (strictly confirmed & ready items)
        kb_stmt = select(KnowledgeBase).where(KnowledgeBase.space_id == resolved_space_id)
        kb = await db.scalar(kb_stmt)
        if kb:
            items_stmt = select(KnowledgeBaseItem).where(
                KnowledgeBaseItem.kb_id == kb.id
            ).order_by(KnowledgeBaseItem.created_at.desc()).limit(settings.YULLO_ABOUT_MAX_EXCERPTS)
            
            items = (await db.scalars(items_stmt)).all()
            for item in items:
                meta = item.source_metadata or {}
                # Only include sources where is_confirmed = True
                if isinstance(meta, dict) and meta.get("is_confirmed") is False:
                    continue

                status_val = item.ingestion_status or meta.get("status", "ready")
                if status_val not in ("ready", "completed", "success"):
                    continue

                text_content = (item.content or item.description or meta.get("raw_text") or "").strip()
                extracted_facts = item.extracted_facts or meta.get("facts") or []
                
                add_excerpt(
                    source_id=str(item.id),
                    title=item.title or item.doc_id or "Knowledge Item",
                    text=text_content,
                    url=item.source_locator or "",
                    version=item.source_version or 1,
                    facts=[f for f in extracted_facts if isinstance(f, str)]
                )

        # 2. Query YulloSources for this space (strictly confirmed & ready)
        yullo_sources_stmt = select(YulloSource).where(
            YulloSource.space_id == resolved_space_id
        ).order_by(YulloSource.created_at.desc()).limit(settings.YULLO_ABOUT_MAX_EXCERPTS)
        
        yullo_sources = (await db.scalars(yullo_sources_stmt)).all()
        for source in yullo_sources:
            meta = source.metadata_json or {}
            if meta.get("is_confirmed") is False:
                continue

            status_val = source.status or meta.get("status", "ready")
            if status_val not in ("ready", "completed", "success"):
                continue

            title = meta.get("title") or source.type or "Source"
            raw_text = meta.get("raw_text", "").strip()
            facts = meta.get("facts", [])
            url = meta.get("content_ref") or meta.get("url") or source.content_ref or ""
            
            add_excerpt(
                source_id=str(source.id),
                title=title,
                text=raw_text or f"Reference Link: {url}",
                url=url,
                version=getattr(source, "source_version", 1),
                facts=[f for f in facts if isinstance(f, str)]
            )

    # 3. Add client-provided sources from payload if present
    if client_sources and isinstance(client_sources, list):
        for idx, cs in enumerate(client_sources, start=1):
            if isinstance(cs, dict) and cs.get("is_confirmed", True) is not False:
                sid = cs.get("id") or f"payload-{idx}"
                title = cs.get("title") or cs.get("source_type") or f"Payload Source {idx}"
                raw_text = cs.get("raw_text") or cs.get("text") or cs.get("content_ref") or ""
                facts = cs.get("facts", [])
                add_excerpt(
                    source_id=str(sid),
                    title=title,
                    text=raw_text,
                    url=cs.get("content_ref", ""),
                    version=1,
                    facts=[f for f in facts if isinstance(f, str)]
                )

    # 4. If draft website URL is provided (or mentioned in user_message), include it as reference
    active_website = draft_website
    if user_message:
        import re
        url_match = re.search(r"https?://[^\s)]+", user_message)
        if url_match:
            active_website = url_match.group(0)

    if active_website and active_website.strip():
        add_excerpt(
            source_id="draft-website",
            title="Owner Website",
            text=f"Website address: {active_website.strip()}",
            url=active_website.strip()
        )

    search_candidates: List[Dict[str, Any]] = []
    if not excerpts and space_name:
        try:
            from app.orchestra.ai.tools.web_search import search_web
            query = " ".join(str(value) for value in (space_name, owner_category, space_type, presence) if value).strip()
            logger.info("yullo.identity.search", extra={"space_id": str(resolved_space_id) if resolved_space_id else None})
            search_candidates = await search_web(query=query, limit=3)
        except Exception as e:
            logger.warning(f"collect_about_context: search_web error: {e}")

    return {
        "space_name": space_name,
        "space_type": space_type,
        "owner_description": owner_description,
        "owner_category": owner_category,
        "presence": presence,
        "previous_description": previous_description,
        "previous_category": previous_category,
        "excerpts": excerpts,
        "search_candidates": search_candidates,
        "found_space": True if (target_space or space_name) else False,
        "space_id": resolved_space_id
    }

def validate_about_context(context: Dict[str, Any]) -> bool:
    """
    Ensures context is available. Space name and type are sufficient for baseline generation.
    """
    space_name = (context.get("space_name") or "").strip()
    excerpts = context.get("excerpts", [])
    if space_name or len(excerpts) > 0:
        return True
        
    logger.info("validate_about_context: Insufficient context (no space name or excerpts)")
    return False

def build_about_prompt(
    context: Dict[str, Any],
    history: Optional[List[Dict[str, str]]] = None,
    user_message: Optional[str] = None
) -> Tuple[List[Dict[str, str]], str, List[str]]:
    """
    Builds system and user prompts for single-LLM Identity & Category generation.
    Supports multi-turn back-and-forth conversational follow-ups.
    Returns (messages, input_fingerprint, list_of_valid_source_ids).
    """
    space_name = context.get("space_name", "")
    space_type = context.get("space_type", "")
    owner_desc = context.get("owner_description", "")
    excerpts = context.get("excerpts", [])
    search_candidates = context.get("search_candidates", [])
    
    valid_source_ids: List[str] = []
    excerpts_text = ""
    for idx, e in enumerate(excerpts, start=1):
        sid = e.get("source_id", f"source-{idx}")
        valid_source_ids.append(sid)
        facts_line = f"\n  Facts: {'; '.join(e['facts'])}" if e.get("facts") else ""
        excerpts_text += f"\n[source_id: {sid} | Title: {e.get('title')} | URL: {e.get('url')}]:\n  Text: {e.get('text')}{facts_line}\n"

    search_candidates_text = ""
    for idx, sc in enumerate(search_candidates, start=1):
        desc = sc.get("description", "")
        snippet = sc.get("snippet", "") or sc.get("markdown", "")
        detail = snippet if snippet else desc
        detail_line = f" - {detail}" if detail else ""
        search_candidates_text += f"{idx}. {sc.get('title')} ({sc.get('url')}){detail_line}\n"

    from app.orchestra.ai.prompts.yullo.about import ABOUT_SYSTEM_PROMPT as system_prompt, build_about_user_prompt

    user_prompt = build_about_user_prompt(
        space_name,
        space_type,
        owner_desc,
        excerpts_text if excerpts else "",
        search_candidates_text=search_candidates_text,
        owner_category=context.get("owner_category", ""),
        presence=context.get("presence", ""),
        previous_description=context.get("previous_description", ""),
        previous_category=context.get("previous_category", ""),
    )

    if context.get("generation_basis") == "owner_only":
        user_prompt += "\nDraft from the owner's inputs only. No external identity verification is required to describe what the owner stated. If category or owner description is meaningful, return a concise ready draft using only those facts and presence. Shorter than 120 characters is acceptable when details are limited. Do not invent specialties, credentials, addresses, clients, services or scale. Only request more details if the owner supplied no meaningful description or category. claims must be []."

    raw_fingerprint = json.dumps({"name": space_name, "purpose": space_type, "owner_description": owner_desc,
                                  "owner_category": context.get("owner_category"), "presence": context.get("presence"),
                                  "previous_description": context.get("previous_description"), "previous_category": context.get("previous_category"),
                                  "excerpts": excerpts_text, "search": search_candidates_text, "history": history,
                                  "feedback": user_message, "prompt_version": PROMPT_VERSION,
                                  "generation_basis": context.get("generation_basis", "owner_with_evidence")}, sort_keys=True)
    input_fingerprint = hashlib.sha256(raw_fingerprint.encode("utf-8")).hexdigest()[:16]
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    if history and isinstance(history, list):
        for turn in history:
            role = turn.get("role")
            content = turn.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": str(content)})

    if user_message and user_message.strip():
        user_text = user_message.strip()
        last_msg = messages[-1] if len(messages) > 2 else None
        # Avoid duplicating the user message if it's already the last user turn in history
        if not (last_msg and last_msg.get("role") == "user" and user_text == last_msg.get("content", "").strip()):
            messages.append({
                "role": "user",
                "content": f"User follow-up / feedback: {user_text}\nGenerate updated grounded identity suggestion in valid JSON format."
            })

    return messages, input_fingerprint, valid_source_ids



async def generate_about_candidate(messages: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    """
    Invokes LLM provider fallback chain via get_async_openai_clients.
    Returns parsed candidate dictionary.
    """
    clients = get_async_openai_clients(override_model=settings.YULLO_ABOUT_MODEL)
    if not clients:
        logger.error("generate_about_candidate: No configured LLM providers available.")
        return None
        
    for provider_name, client, model_name in clients:
        try:
            logger.info(f"Attempting identity suggestion generation with provider={provider_name}, model={model_name}")
            
            kwargs: Dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "timeout": settings.YULLO_ABOUT_TIMEOUT_SECONDS
            }
            
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

def validate_about_candidate(candidate: Dict[str, Any], valid_source_ids: List[str], fixed_category: str = "") -> bool:
    """
    Strict validation for structured LLM identity output.
    Rejects unknown source IDs, excessive length, or invalid structure.
    """
    if not isinstance(candidate, dict):
        return False
        
    status = candidate.get("status")
    if status not in ("ready", "insufficient_context", "needs_clarification", "unavailable"):
        return False

    if status == "needs_clarification":
        clarification = candidate.get("clarification")
        return bool(clarification   and isinstance(clarification, str) and clarification.strip())

    if status == "insufficient_context":
        return True

    if status == "ready":
        desc = candidate.get("description")
        category = candidate.get("category")
        claims = candidate.get("claims", [])
        
        if desc is not None and isinstance(desc, str):
            if len(desc.strip()) > 280:
                logger.warning(f"validate_about_candidate: Description exceeded 280 chars ({len(desc)})")
                return False
                
        if category is not None and isinstance(category, str):
            if len(category.strip()) > 80 and category.strip() != fixed_category:
                logger.warning(f"validate_about_candidate: Category exceeded 80 chars ({len(category)})")
                return False

        if isinstance(claims, list):
            valid_set = set(valid_source_ids)
            for claim in claims:
                if isinstance(claim, dict):
                    sid = str(claim.get("source_id", ""))
                    if valid_set and sid and sid not in valid_set:
                        logger.warning(f"validate_about_candidate: Rejected unknown source_id '{sid}' not in valid set {valid_set}")
                        return False

        return True

    return False

async def suggest_about(
    db: AsyncSession,
    user_id: uuid.UUID,
    space_id: Optional[uuid.UUID] = None,
    draft_website: Optional[str] = None,
    override_name: Optional[str] = None,
    client_sources: Optional[List[dict]] = None,
    history: Optional[List[Dict[str, str]]] = None,
    user_message: Optional[str] = None,
    draft_purpose: Optional[str] = None,
    draft_category: Optional[str] = None,
    category_source: Optional[str] = None,
    draft_presence: Optional[str] = None,
    draft_description: Optional[str] = None,
    description_source: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main entry point for generating Identity suggestion (About + Category) server-side in ONE single LLM call.
    Supports multi-turn interactive conversational follow-ups.
    Returns structured result dict with status: 'ready', 'insufficient_context', 'needs_clarification', or 'unavailable'.
    """
    try:
        context = await collect_about_context(
            db, 
            user_id=user_id, 
            space_id=space_id, 
            draft_website=draft_website,
            override_name=override_name,
            client_sources=client_sources,
            user_message=user_message,
            draft_purpose=draft_purpose, draft_category=draft_category, category_source=category_source,
            draft_presence=draft_presence, draft_description=draft_description, description_source=description_source,
        )
        
        if not context.get("found_space"):
            return {
                "status": "insufficient_context",
                "description": None,
                "category": None,
                "claims": [],
                "clarification": "No active space or draft found.",
                "prompt_version": PROMPT_VERSION,
                "input_fingerprint": None
            }
            
        if not validate_about_context(context):
            return {
                "status": "insufficient_context",
                "description": None,
                "category": None,
                "claims": [],
                "clarification": "Space name and purpose give Aura a title. Add a website link or document under 'Give Aura a head start' to generate a rich, grounded description.",
                "prompt_version": PROMPT_VERSION,
                "input_fingerprint": None
            }
            
        messages, input_fingerprint, valid_source_ids = build_about_prompt(
            context,
            history=history,
            user_message=user_message
        )
        candidate = await generate_about_candidate(messages)
        owner_category = context.get("owner_category", "")
        owner_constraints = bool(owner_category or context.get("presence") or context.get("owner_description"))
        search_matches_owner = True
        if isinstance(candidate, dict):
            # Search may enrich identity, but cannot silently reclassify owner input.
            if owner_category:
                candidate["category"] = owner_category
            uncertain_match = candidate.get("identity_match") in ("uncertain", "conflict")
            unconfirmed_search = bool(context.get("search_candidates")) and candidate.get("identity_match") != "consistent"
            if owner_constraints and (uncertain_match or unconfirmed_search):
                search_matches_owner = False
                # A search mismatch is not a reason to discard useful owner input.
                # Retry once without external content or previous assistant proposals.
                owner_context = {
                    **context, "excerpts": [], "search_candidates": [],
                    "previous_description": "", "previous_category": "",
                    "generation_basis": "owner_only",
                }
                owner_history = [turn for turn in (history or []) if turn.get("role") == "user"]
                messages, input_fingerprint, valid_source_ids = build_about_prompt(
                    owner_context, history=owner_history, user_message=user_message,
                )
                candidate = await generate_about_candidate(messages)
                if isinstance(candidate, dict):
                    candidate["claims"] = []
                    if owner_category:
                        candidate["category"] = owner_category
                logger.info("yullo.identity.owner_draft", extra={"space_id": str(context.get("space_id")),
                            "status": candidate.get("status") if isinstance(candidate, dict) else "unavailable"})

        if not candidate or not validate_about_candidate(candidate, valid_source_ids, fixed_category=owner_category):
            logger.warning("suggest_about: candidate generation or validation failed")
            return {
                "status": "unavailable",
                "description": None,
                "category": None,
                "claims": [],
                "clarification": "Generation service is currently unavailable.",
                "prompt_version": PROMPT_VERSION,
                "input_fingerprint": input_fingerprint
            }
            
        res_status = candidate.get("status", "ready")
        clarification = candidate.get("clarification")
        if res_status in ("insufficient_context", "needs_clarification") and not clarification:
            clarification = f"The provided context for '{context.get('space_name') or 'this space'}' is not enough to determine your presence. Please provide an official website URL or document."

        candidate_match = None
        search_cands = context.get("search_candidates") or []
        top_cand = search_cands[0] if search_cands and search_matches_owner else None
        if top_cand:
            candidate_match = {
                "title": top_cand.get("title"),
                "url": top_cand.get("url"),
                "snippet": top_cand.get("snippet") or top_cand.get("description"),
                "candidate_description": (candidate.get("description") or "").strip() if candidate.get("description") else None,
                "candidate_category": (candidate.get("category") or "").strip() if candidate.get("category") else None,
            }
        elif clarification and search_matches_owner:
            import re
            title_m = re.search(r"matches for '([^']+)'|online presence for ([^(\s]+)", clarification)
            url_m = re.search(r"\((https?://[^\s)]+)\)|(https?://[^\s)]+)", clarification)
            detected_url = url_m.group(1) if (url_m and url_m.group(1)) else (url_m.group(2) if url_m else None)
            if detected_url:
                candidate_match = {
                    "title": title_m.group(1) if (title_m and title_m.group(1)) else (title_m.group(2) if title_m else None),
                    "url": detected_url,
                    "snippet": None,
                    "candidate_description": (candidate.get("description") or "").strip() if candidate.get("description") else None,
                    "candidate_category": (candidate.get("category") or "").strip() if candidate.get("category") else None,
                }


        return {
            "status": res_status,
            "description": (candidate.get("description") or "").strip() if candidate.get("description") else None,
            "category": (candidate.get("category") or "").strip() if candidate.get("category") else None,
            "claims": candidate.get("claims", []),
            "clarification": clarification,
            "candidate_match": candidate_match,
            "prompt_version": PROMPT_VERSION,
            "input_fingerprint": input_fingerprint
        }
    except Exception as e:
        logger.error(f"Error in suggest_about: {e}", exc_info=True)
        return {
            "status": "unavailable",
            "description": None,
            "category": None,
            "claims": [],
            "clarification": "Generation failed due to internal error.",
            "prompt_version": PROMPT_VERSION,
            "input_fingerprint": None
        }

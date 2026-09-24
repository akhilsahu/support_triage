from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import uuid

from app.core.database import get_db
from app.models.space import Space
from app.models.yullo_space_entity import YulloSpaceEntity
from app.yullo.adapters.conversations import YulloConversationRepository
from app.yullo.services.knowledge.retriever import YulloRetriever
from app.orchestra.ai.knowledge.agno_chroma import AgnoChromaKnowledgeBackend
from app.yullo.services.inference.runtime import YulloAuraRuntime
from app.yullo.schemas.inference import AuraInferenceRequest

router = APIRouter(tags=["Aura"])

def get_aura_runtime(db: AsyncSession = Depends(get_db)) -> YulloAuraRuntime:
    conversations = YulloConversationRepository(db)
    backend = AgnoChromaKnowledgeBackend(db)
    retriever = YulloRetriever(db, backend)
    return YulloAuraRuntime(db, retriever, conversations)

@router.get("/spaces/{handle}")
async def get_public_space(
    handle: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(Space)
        .where(Space.slug == handle, Space.product == "yullo")
    )
    result = await db.execute(stmt)
    space = result.scalar_one_or_none()
    
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
        
    return {
        "id": str(space.id),
        "handle": space.slug,
        "displayName": space.name,
        "description": "Welcome to our space", # TODO: Get from appearance_config
        "locationLabel": "", # TODO: Get from appearance_config
        "promptStarters": [], # TODO: Get from published Aura version
        "auraEnabled": True
    }

@router.get("/spaces/{space_id}/entities/{entity_id}")
async def get_public_entity(
    space_id: uuid.UUID,
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(YulloSpaceEntity)
        .where(
            YulloSpaceEntity.id == entity_id,
            YulloSpaceEntity.space_id == space_id,
            YulloSpaceEntity.is_public == True,
            YulloSpaceEntity.is_active == True
        )
    )
    result = await db.execute(stmt)
    entity = result.scalar_one_or_none()
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found or not public")
        
    return {
        "id": str(entity.id),
        "space_id": str(entity.space_id),
        "entity_type": entity.entity_type,
        "title": entity.payload_json.get("title", "Untitled"),
        "payload_json": entity.payload_json
    }

@router.post("/spaces/{space_id}/aura/sessions")
async def start_aura_session(
    space_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    Start a new Aura session for a given space.
    """
    conversations = YulloConversationRepository(db)
    runtime_id = "default_aura" # In the future, this might be tied to a specific Aura version
    session = await conversations.start(space_id, runtime_id)
    return {"session_id": str(session.id)}


@router.post("/spaces/{space_id}/aura/sessions/{session_id}/chat")
async def stream_aura_chat(
    space_id: uuid.UUID,
    session_id: uuid.UUID,
    request: AuraInferenceRequest,
    db: AsyncSession = Depends(get_db),
    runtime: YulloAuraRuntime = Depends(get_aura_runtime)
):
    """
    Stream a chat completion using the Aura runtime.
    """
    if str(request.space_id) != str(space_id) or str(request.session_id) != str(session_id):
        raise HTTPException(status_code=400, detail="Path parameters do not match request body")

    async def event_generator():
        async for chunk in runtime.stream_response(request):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

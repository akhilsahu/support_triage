import uuid
import logging
from typing import Optional
from pydantic import BaseModel
import asyncio

from sqlalchemy import select, and_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.conversation_turn import ConversationTurn
from app.models.chat import ChatSession
from app.models.message import Message
from app.models.conversation_event import ConversationEvent
from app.yullo.adapters.conversation_events import append_aura_event

logger = logging.getLogger(__name__)

class ExecutedAction(BaseModel):
    action_kind: str
    category: Optional[str] = None

class IntentConfig(BaseModel):
    llm_intent_enabled: bool = False
    provider: str = "openai"
    model: str = "gpt-3.5-turbo"
    classifier_version: str = "v1"

class IntentEvidence(BaseModel):
    intent: str
    origin: str  # explicit_action or model
    traffic_class: str = "production"

CONTROLLED_LABELS = {"booking", "contact", "pricing", "service", "portfolio", "location", "general", "unknown"}

def intent_from_validated_action(action: ExecutedAction) -> Optional[IntentEvidence]:
    if action.category and action.category in CONTROLLED_LABELS:
        return IntentEvidence(intent=action.category, origin="explicit_action")
    return None

async def classify_turn(message: str, *, config: IntentConfig) -> Optional[IntentEvidence]:
    if not config.llm_intent_enabled:
        return None
        
    try:
        from app.core.llm_provider import get_async_openai_clients
        text_to_classify = message[:2000]
        
        clients_map = get_async_openai_clients()
        
        # Determine the client to use based on config, fallback to default
        client = None
        if config.provider in clients_map:
             client = clients_map[config.provider]
        elif clients_map:
             client = list(clients_map.values())[0]
             
        if not client:
             logger.error("No LLM clients available for intent classification")
             return IntentEvidence(intent="unknown", origin="model")
        
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=config.model,
                messages=[
                    {"role": "system", "content": f"Classify the intent into one of: {', '.join(CONTROLLED_LABELS)}. Return JSON {{'intent': '...'}}"},
                    {"role": "user", "content": text_to_classify}
                ],
                response_format={"type": "json_object"},
                temperature=0.0
            ),
            timeout=2.0
        )
        
        import json
        result_str = response.choices[0].message.content
        if result_str:
            data = json.loads(result_str)
            intent = data.get("intent", "unknown")
            if intent not in CONTROLLED_LABELS:
                intent = "unknown"
                logger.warning("Classifier returned invalid intent output")
            return IntentEvidence(intent=intent, origin="model")
            
    except asyncio.TimeoutError:
        logger.warning("Intent classification timed out")
        return IntentEvidence(intent="unknown", origin="model")
    except Exception as e:
        logger.warning(f"Intent classification failed: {e}")
        return IntentEvidence(intent="unknown", origin="model")
        
    return None

async def classify_and_record_intent(turn_id: uuid.UUID, config: IntentConfig, executed_action: Optional[ExecutedAction] = None) -> None:
    # 1. Read turn, user_message_id, session identity
    async with AsyncSessionLocal() as db:
        stmt = select(ConversationTurn).where(ConversationTurn.id == turn_id)
        turn = await db.scalar(stmt)
        if not turn:
            return
            
        stmt = select(ChatSession).where(ChatSession.id == turn.session_id)
        session = await db.scalar(stmt)
        if not session:
            return
            
        # Reject preview/evaluation traffic
        if session.status in ("evaluation", "preview"):
            return
            
        # Verify turn space matches session space
        if turn.space_id != session.space_id:
            logger.error("Turn space ID does not match session space ID")
            return
            
        user_message_id = turn.user_message_id
        
        # Check if intent event already exists
        stmt_exists = select(exists().where(
            and_(
                ConversationEvent.operation_id == str(user_message_id),
                ConversationEvent.event_type == "intent.classified"
            )
        ))
        intent_exists = await db.scalar(stmt_exists)
        if intent_exists:
            return
            
        # Read the actual message text
        stmt_msg = select(Message).where(Message.id == user_message_id)
        message_obj = await db.scalar(stmt_msg)
        if not message_obj or not message_obj.content:
            return
        message_text = message_obj.content
        
    # 2. Prefer action category or classify
    evidence = None
    if executed_action:
        evidence = intent_from_validated_action(executed_action)
        
    if not evidence and config.llm_intent_enabled:
        evidence = await classify_turn(message_text, config=config)
        
    if not evidence or evidence.intent == "unknown":
        return
        
    # 4. In a new short transaction revalidate and record
    async with AsyncSessionLocal() as db:
        # Reload and revalidate turn and session
        stmt = select(ConversationTurn).where(ConversationTurn.id == turn_id)
        turn = await db.scalar(stmt)
        if not turn:
            return
            
        stmt = select(ChatSession).where(ChatSession.id == turn.session_id)
        session = await db.scalar(stmt)
        if not session:
            return
            
        if turn.space_id != session.space_id:
            return
            
        metadata = {
            "intent_origin": evidence.origin,
            "classifier_version": config.classifier_version,
            "traffic_class": evidence.traffic_class
        }
        
        try:
            await append_aura_event(
                db=db,
                session=session,
                event_type="intent.classified",
                operation_id=user_message_id,
                message_id=user_message_id,
                occurred_at=turn.started_at,
                intent=evidence.intent,
                metadata=metadata
            )
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to record intent: {e}")
            await db.rollback()

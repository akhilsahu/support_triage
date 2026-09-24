import uuid
import hashlib
from datetime import datetime
from typing import Optional

from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.models.chat import ChatSession
from app.models.conversation import Message
from app.models.conversation_turn import ConversationTurn
from app.yullo.services.conversations.contracts import VisitorProof, SessionCreated, AcceptedTurn, ValidatedAuraResult
from app.yullo.services.home.intent import classify_and_record_intent, IntentConfig
from app.yullo.adapters.conversation_events import append_aura_event
from app.core.database import AsyncSessionLocal

class AuraConversationService:
    @staticmethod
    def _verify_visitor_session(space_id: uuid.UUID, visitor_proof: VisitorProof) -> bool:
        # Simplistic implementation to simulate visitor session validation
        return bool(visitor_proof.auth_token)
        
    @staticmethod
    def _compute_request_hash(message: str) -> str:
        return hashlib.sha256(message.encode('utf-8')).hexdigest()

    async def start_session(self, db: AsyncSession, *, space_id: uuid.UUID, visitor_proof: VisitorProof) -> SessionCreated:
        if not self._verify_visitor_session(space_id, visitor_proof):
            raise HTTPException(status_code=401, detail="Invalid visitor proof")
            
        session = ChatSession(
            space_id=space_id,
            runtime_type="aura",
            runtime_id=f"aura-{uuid.uuid4().hex[:8]}",
            status="active"
        )
        db.add(session)
        await db.flush()
        
        return SessionCreated(
            session_id=session.id,
            capability_token=f"cap-{session.id}-{uuid.uuid4().hex[:8]}"
        )

    async def accept_turn(self, db: AsyncSession, *, space_id: uuid.UUID, session_id: uuid.UUID, visitor_proof: VisitorProof,
        client_turn_id: uuid.UUID, message: str) -> AcceptedTurn:
        
        if not self._verify_visitor_session(space_id, visitor_proof):
            raise HTTPException(status_code=401, detail="Invalid visitor proof")
            
        # Lock validated session
        stmt = select(ChatSession).where(
            and_(ChatSession.id == session_id, ChatSession.space_id == space_id)
        ).with_for_update()
        session = await db.scalar(stmt)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        request_hash = self._compute_request_hash(message)
        
        # Check for existing turn
        stmt = select(ConversationTurn).where(
            and_(ConversationTurn.session_id == session_id, ConversationTurn.client_turn_id == client_turn_id)
        )
        existing_turn = await db.scalar(stmt)
        if existing_turn:
            if existing_turn.request_hash != request_hash:
                raise HTTPException(status_code=409, detail="Client turn ID reused with different payload")
            return AcceptedTurn(
                turn_id=existing_turn.id,
                status=existing_turn.status,
                message_id=existing_turn.user_message_id
            )
            
        # Insert user message
        user_message = Message(
            session_id=str(session_id),
            space_id=space_id,
            role="user",
            content=message
        )
        db.add(user_message)
        await db.flush()
        
        # Update session
        session.message_count += 1
        session.last_message_at = datetime.utcnow()
        if session.message_count == 1:
            # First message
            await append_aura_event(
                db=db,
                session=session,
                event_type="conversation.started",
                operation_id=session.id,
                message_id=user_message.id,
                occurred_at=session.started_at
            )
            
        # Insert turn
        turn = ConversationTurn(
            space_id=space_id,
            session_id=session_id,
            client_turn_id=client_turn_id,
            request_hash=request_hash,
            runtime_type="aura",
            runtime_id=session.runtime_id or "aura",
            status="accepted",
            user_message_id=user_message.id
        )
        db.add(turn)
        await db.flush()
        
        await append_aura_event(
            db=db,
            session=session,
            event_type="message.received",
            operation_id=client_turn_id,
            message_id=user_message.id,
            occurred_at=datetime.utcnow()
        )
        
        return AcceptedTurn(
            turn_id=turn.id,
            status=turn.status,
            message_id=user_message.id
        )

    async def complete_turn(self, db: AsyncSession, *, turn_id: uuid.UUID, result: ValidatedAuraResult) -> None:
        stmt = select(ConversationTurn).where(ConversationTurn.id == turn_id).with_for_update()
        turn = await db.scalar(stmt)
        if not turn:
            raise HTTPException(status_code=404, detail="Turn not found")
            
        stmt = select(ChatSession).where(ChatSession.id == turn.session_id)
        session = await db.scalar(stmt)
            
        assistant_message = Message(
            session_id=str(turn.session_id),
            space_id=turn.space_id,
            role="assistant",
            content=result.text
        )
        db.add(assistant_message)
        await db.flush()
        
        turn.assistant_message_id = assistant_message.id
        turn.status = "completed"
        turn.finished_at = datetime.utcnow()
        
        session.message_count += 1
        session.last_message_at = turn.finished_at
        
        if session:
            await append_aura_event(
                db=db,
                session=session,
                event_type="retrieval.completed",
                operation_id=turn.client_turn_id,
                message_id=assistant_message.id,
                occurred_at=turn.finished_at,
                source_count=len(result.citations)
            )
            
            await append_aura_event(
                db=db,
                session=session,
                event_type="answer.completed",
                operation_id=turn.client_turn_id,
                message_id=assistant_message.id,
                occurred_at=turn.finished_at
            )
            
    async def fail_turn(self, db: AsyncSession, *, turn_id: uuid.UUID, code: str) -> None:
        stmt = select(ConversationTurn).where(ConversationTurn.id == turn_id).with_for_update()
        turn = await db.scalar(stmt)
        if not turn:
            raise HTTPException(status_code=404, detail="Turn not found")
            
        turn.status = "failed"
        turn.error_code = code
        turn.finished_at = datetime.utcnow()

from typing import List, Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, asc

from app.models.chat import ChatSession
from app.models.space import ConversationLog
from app.models.conversation_event import ConversationEvent

class YulloConversationRepository:
    """
    Adapter to run Aura conversations through the canonical chat models 
    without leaking or importing Support247 escalation behavior.
    """
    def __init__(self, db: AsyncSession):
        self.db = db

    async def start(self, space_id: uuid.UUID, runtime_id: str) -> ChatSession:
        """
        Start a new Aura session.
        Leaves chatbot_id and escalation fields null.
        """
        session = ChatSession(
            id=uuid.uuid4(),
            space_id=space_id,
            runtime_type="aura",
            runtime_id=runtime_id,
            status="open",
            message_count=0
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def append_user(self, session: ChatSession, message: str) -> ConversationLog:
        """
        Append a user message to the Aura session.
        """
        if session.runtime_type != "aura":
            raise ValueError("Cannot append user message to non-Aura session via YulloConversationRepository.")
            
        log = ConversationLog(
            space_id=session.space_id,
            session_id=str(session.id),
            runtime_type=session.runtime_type,
            runtime_id=session.runtime_id,
            role="user",
            message=message
        )
        self.db.add(log)
        
        session.message_count += 1
        self.db.add(session)
        await self.db.flush()
        
        return log

    async def append_aura(self, session: ChatSession, message: str, citations: Optional[list] = None, blocks: Optional[list] = None) -> ConversationLog:
        """
        Append an Aura response to the session.
        Validates basic citations and UI block constraints before persistence.
        """
        if session.runtime_type != "aura":
            raise ValueError("Cannot append Aura message to non-Aura session via YulloConversationRepository.")
            
        # Basic validation of blocks according to Yullo resources
        if blocks:
            for block in blocks:
                if not isinstance(block, dict) or "type" not in block:
                    raise ValueError("Invalid block format. Must be a dict with a 'type' key.")
                    
        log = ConversationLog(
            space_id=session.space_id,
            session_id=str(session.id),
            runtime_type=session.runtime_type,
            runtime_id=session.runtime_id,
            role="assistant",
            message=message,
            citations=citations,
            blocks=blocks
        )
        self.db.add(log)
        
        session.message_count += 1
        self.db.add(session)
        await self.db.flush()
        
        return log

    async def history(self, session_id: str) -> List[ConversationLog]:
        """
        Load the history of a session, enforcing that it is an Aura session.
        """
        # First verify the session is Aura
        session_stmt = select(ChatSession).where(
            ChatSession.id == uuid.UUID(session_id),
            ChatSession.runtime_type == "aura"
        )
        result = await self.db.execute(session_stmt)
        session = result.scalars().first()
        
        if not session:
            raise ValueError("Session not found or not an Aura session.")
            
        # Fetch logs
        stmt = select(ConversationLog).where(
            ConversationLog.session_id == session_id
        ).order_by(asc(ConversationLog.timestamp))
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

import json
from collections.abc import AsyncGenerator
import structlog
from typing import List, Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, asc

from app.models.chat import ChatSession
from app.models.space import ConversationLog

from app.yullo.schemas.inference import AuraInferenceRequest
from app.yullo.schemas.retrieval import YulloExecutionContext

logger = structlog.get_logger()


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
            ConversationLog.session_id == session_id,
            ConversationLog.space_id == session.space_id,
            ConversationLog.runtime_type == "aura",
        ).order_by(asc(ConversationLog.timestamp), asc(ConversationLog.id))
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def stream_response(self, request: AuraInferenceRequest, *, generate, cfg) -> AsyncGenerator[str, None]:
        try:
            # An empty history is valid for a newly created conversation.
            from sqlalchemy import select

            from app.models.chat import ChatSession

            stmt = select(ChatSession).where(
                ChatSession.id == request.session_id,
                ChatSession.space_id == request.space_id,
                ChatSession.runtime_type == "aura",
            ).with_for_update().execution_options(populate_existing=True)
            result = await self.db.execute(stmt)
            session = result.scalars().first()
            if not session:
                raise ValueError("Session not found, expired, or belongs to another Space")

            from app.orchestra.ai.session.store import StagedHistory
            from types import SimpleNamespace

            def audit_records(logs):
                return [dict(id=log.id, role=log.role, message=log.message, timestamp=log.timestamp)
                        for log in logs]

            logs = await self.history(request.session_id)
            native = await StagedHistory.open(
                cfg, scope_id=str(request.space_id), session_id=request.session_id,
                records=audit_records(logs), namespace='aura',
            )
            # Routing may inspect native history; it is never manually injected
            # into the model messages. Agno alone constructs model history.
            history = [SimpleNamespace(role=item.role, message=item.content or '')
                       for item in native.messages()]

            # 2. Append User Message
            await self.append_user(session, request.message)

            # 3. Retrieve Context & 4. Call Headless Stream
            context_req = YulloExecutionContext(
                space_id=request.space_id,
                kb_ids=request.kb_ids,
                published_version=request.published_version
            )

            # Setup Usage Context
            import uuid

            from app.services.ai_usage_context import reset_ai_usage_context
            from app.yullo.adapters.usage import set_aura_inference_context

            ctx_token = set_aura_inference_context(
                space_id=request.space_id,
                session_id=request.session_id,
                message_id=None, # Will be created
                aura_id=uuid.UUID(int=0), # Dummy until proper Aura ID is passed
                aura_version_id=uuid.UUID(int=0)
            )

            full_response = ""
            citation_refs = []
            ui_blocks = []
            completed = False

            try:
                async for chunk in generate(
                    context_req, request.message, history, request.model,
                    execution={'cfg': cfg, 'history': native},
                ):
                    try:
                        data = json.loads(chunk.strip())
                        if data.get("type") == "error":
                            yield chunk
                            return
                        if data.get("type") == "message.done":
                            completed = True
                            continue
                        if data.get("type") == "text.delta":
                            full_response += data.get("delta", "")
                        elif data.get("type") == "citation.add":
                            citation_refs.append({"source": "retrieval", "count": 1})
                        elif data.get("type") == "ui.add" and data.get("node"):
                            ui_blocks.append(data["node"])
                    except Exception:
                        pass
                    yield chunk

                if not completed or (not full_response.strip() and not ui_blocks):
                    yield json.dumps({"type": "error", "message": "Aura response was interrupted. Please try again."}) + "\n"
                    return

                # 6. Commit assistant response
                if citation_refs:
                    citation_refs = [{"source": "retrieval", "count": len(citation_refs)}]

                await self.append_aura(
                    session,
                    message=full_response,
                    citations=citation_refs,
                    blocks=ui_blocks
                )
                await self.db.commit()
                # Reacquire the same conversation lock after the app commit.
                # Another request may have committed meanwhile: synchronize all
                # committed audit rows so publishing cannot overwrite its turn.
                await self.db.execute(stmt)
                committed_logs = await self.history(request.session_id)
                await native.publish(audit_records(committed_logs))
                await self.db.commit()
                yield json.dumps({"type": "message.done"}) + "\n"
            finally:
                reset_ai_usage_context(ctx_token)

        except Exception as e:
            await self.db.rollback()
            logger.exception("aura_runtime_error", error_type=type(e).__name__)
            yield json.dumps({"type": "error", "message": "Session not found or expired" if isinstance(e, ValueError) and str(e).startswith("Session not found") else "Aura could not complete the response. Please try again."}) + "\n"
        finally:
            await self.db.rollback()

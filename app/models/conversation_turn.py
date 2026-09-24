"""
ConversationTurn — Idempotent request/response ledger for Aura & Support247.
Replaces yullo_aura_turns with a shared table.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from sqlalchemy.orm import relationship


class ConversationTurn(Base):
    __tablename__ = "conversation_turns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    
    client_turn_id = Column(UUID(as_uuid=True), nullable=False)
    request_hash = Column(String(64), nullable=False)
    
    runtime_type = Column(String(20), nullable=False)  # e.g., 'aura' or generic Support247 identifier
    runtime_id = Column(String(100), nullable=False)
    runtime_version_id = Column(UUID(as_uuid=True), nullable=True)
    
    # allowed status: accepted | generating | completed | failed | interrupted
    status = Column(String(20), nullable=False)
    
    user_message_id = Column(UUID(as_uuid=True), ForeignKey("conversation_logs.id", ondelete="CASCADE"), nullable=False)
    assistant_message_id = Column(UUID(as_uuid=True), ForeignKey("conversation_logs.id", ondelete="CASCADE"), nullable=True)
    
    started_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    lease_expires_at = Column(DateTime(timezone=True), nullable=True)
    error_code = Column(String(80), nullable=True)

    __table_args__ = (
        UniqueConstraint("session_id", "client_turn_id", name="uq_conv_turn_session_client"),
    )
    
    # Relationships
    space = relationship("Space", foreign_keys=[space_id])
    session = relationship("ChatSession", foreign_keys=[session_id])
    user_message = relationship("ConversationLog", foreign_keys=[user_message_id])
    assistant_message = relationship("ConversationLog", foreign_keys=[assistant_message_id])

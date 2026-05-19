"""Conversation and message models for chat history"""

from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Index, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base


class Conversation(Base):
    """
    Conversation model for tracking chat sessions.
    
    Stores conversation metadata and links to individual messages.
    """
    
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    title = Column(String(255), nullable=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(String(255), nullable=True, index=True)
    conv_metadata = Column(JSON, default={}, nullable=False)
    message_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    agent = relationship("Agent", backref="conversations", foreign_keys=[agent_id])

    # Indexes
    __table_args__ = (
        Index('ix_conversations_user_id', 'user_id'),
        Index('ix_conversations_agent_id', 'agent_id'),
        Index('ix_conversations_created_at', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, title={self.title})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": str(self.id),
            "title": self.title,
            "agent_id": str(self.agent_id) if self.agent_id else None,
            "user_id": self.user_id,
            "metadata": self.conv_metadata,
            "message_count": self.message_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Message(Base):
    """
    Message model for individual chat messages.
    
    Stores messages within a conversation with role (user/assistant/system).
    """
    
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    msg_metadata = Column(JSON, default={}, nullable=False)
    tokens = Column(Integer, nullable=True)
    model = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    conversation = relationship("Conversation", backref="messages", foreign_keys=[conversation_id])

    # Indexes
    __table_args__ = (
        Index('ix_messages_conversation_id', 'conversation_id'),
        Index('ix_messages_role', 'role'),
        Index('ix_messages_created_at', 'created_at'),
    )

    def __repr__(self) -> str:
        return f"<Message(id={self.id}, role={self.role})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": str(self.id),
            "conversation_id": str(self.conversation_id),
            "role": self.role,
            "content": self.content,
            "metadata": self.msg_metadata,
            "tokens": self.tokens,
            "model": self.model,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

# Made with Bob

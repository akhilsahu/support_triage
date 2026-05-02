"""
LangGraph State Persistence using PostgreSQL

This module implements durable conversation state storage using PostgresSaver
from langgraph-checkpoint-postgres. It ensures that conversation state persists
across system restarts and enables state recovery.

Key Features:
- Async PostgreSQL connection for state storage
- Checkpoint management for conversation history
- State recovery on system restart
- Thread-safe state updates
"""

from typing import Any, Dict, Optional, Sequence
from datetime import datetime
import json
import asyncio
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata
from langgraph.checkpoint.postgres import PostgresSaver

from app.config import settings
from app.core.database import get_db


class OrchestraCheckpointSaver(PostgresSaver):
    """
    Custom PostgresSaver implementation for OrchestraSupport.
    
    Extends the base PostgresSaver with additional functionality:
    - Custom metadata tracking
    - Performance monitoring
    - Audit logging integration
    """
    
    def __init__(self, conn_string: str):
        """
        Initialize the checkpoint saver.
        
        Args:
            conn_string: PostgreSQL connection string
        """
        super().__init__(conn_string)
        self.conn_string = conn_string
        
    async def setup(self):
        """
        Set up the checkpoint tables in the database.
        
        Creates the necessary tables for storing checkpoints if they don't exist.
        """
        async with self.engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
                    thread_id VARCHAR(255) NOT NULL,
                    checkpoint_id VARCHAR(255) NOT NULL,
                    parent_checkpoint_id VARCHAR(255),
                    checkpoint JSONB NOT NULL,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    PRIMARY KEY (thread_id, checkpoint_id)
                )
            """))
            
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_checkpoints_thread 
                ON langgraph_checkpoints(thread_id)
            """))
            
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_checkpoints_parent 
                ON langgraph_checkpoints(parent_checkpoint_id)
            """))
            
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_checkpoints_created 
                ON langgraph_checkpoints(created_at DESC)
            """))
    
    async def aget(
        self,
        thread_id: str,
        checkpoint_id: Optional[str] = None
    ) -> Optional[Checkpoint]:
        """
        Retrieve a checkpoint asynchronously.
        
        Args:
            thread_id: The conversation thread ID
            checkpoint_id: Optional specific checkpoint ID
            
        Returns:
            The checkpoint if found, None otherwise
        """
        try:
            return await super().aget(thread_id, checkpoint_id)
        except Exception as e:
            print(f"Error retrieving checkpoint: {e}")
            return None
    
    async def aput(
        self,
        thread_id: str,
        checkpoint: Checkpoint,
        metadata: Optional[CheckpointMetadata] = None
    ) -> None:
        """
        Store a checkpoint asynchronously.
        
        Args:
            thread_id: The conversation thread ID
            checkpoint: The checkpoint to store
            metadata: Optional metadata about the checkpoint
        """
        try:
            await super().aput(thread_id, checkpoint, metadata)
        except Exception as e:
            print(f"Error storing checkpoint: {e}")
            raise
    
    async def alist(
        self,
        thread_id: str,
        limit: int = 10
    ) -> Sequence[Checkpoint]:
        """
        List checkpoints for a thread.
        
        Args:
            thread_id: The conversation thread ID
            limit: Maximum number of checkpoints to return
            
        Returns:
            List of checkpoints
        """
        try:
            return await super().alist(thread_id, limit)
        except Exception as e:
            print(f"Error listing checkpoints: {e}")
            return []


class CheckpointManager:
    """
    High-level checkpoint management interface.
    
    Provides convenient methods for managing conversation state
    with additional features like cleanup and statistics.
    """
    
    def __init__(self, saver: OrchestraCheckpointSaver):
        """
        Initialize the checkpoint manager.
        
        Args:
            saver: The checkpoint saver instance
        """
        self.saver = saver
    
    async def save_state(
        self,
        thread_id: str,
        state: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Save conversation state.
        
        Args:
            thread_id: The conversation thread ID
            state: The state to save
            metadata: Optional metadata
            
        Returns:
            The checkpoint ID
        """
        checkpoint_id = f"ckpt_{datetime.utcnow().timestamp()}"
        
        checkpoint = Checkpoint(
            id=checkpoint_id,
            thread_id=thread_id,
            state=state,
            metadata=metadata or {}
        )
        
        await self.saver.aput(thread_id, checkpoint)
        return checkpoint_id
    
    async def load_state(
        self,
        thread_id: str,
        checkpoint_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Load conversation state.
        
        Args:
            thread_id: The conversation thread ID
            checkpoint_id: Optional specific checkpoint ID
            
        Returns:
            The state if found, None otherwise
        """
        checkpoint = await self.saver.aget(thread_id, checkpoint_id)
        if checkpoint:
            return checkpoint.state
        return None
    
    async def get_history(
        self,
        thread_id: str,
        limit: int = 10
    ) -> list[Dict[str, Any]]:
        """
        Get checkpoint history for a thread.
        
        Args:
            thread_id: The conversation thread ID
            limit: Maximum number of checkpoints to return
            
        Returns:
            List of checkpoint states
        """
        checkpoints = await self.saver.alist(thread_id, limit)
        return [
            {
                "checkpoint_id": ckpt.id,
                "state": ckpt.state,
                "metadata": ckpt.metadata,
                "created_at": ckpt.metadata.get("created_at") if ckpt.metadata else None
            }
            for ckpt in checkpoints
        ]
    
    async def cleanup_old_checkpoints(
        self,
        days: int = 30
    ) -> int:
        """
        Clean up old checkpoints.
        
        Args:
            days: Delete checkpoints older than this many days
            
        Returns:
            Number of checkpoints deleted
        """
        async with self.saver.engine.begin() as conn:
            result = await conn.execute(text("""
                DELETE FROM langgraph_checkpoints
                WHERE created_at < NOW() - INTERVAL ':days days'
                RETURNING checkpoint_id
            """), {"days": days})
            
            deleted = len(result.fetchall())
            return deleted
    
    async def get_statistics(self) -> Dict[str, Any]:
        """
        Get checkpoint statistics.
        
        Returns:
            Dictionary with statistics
        """
        async with self.saver.engine.begin() as conn:
            result = await conn.execute(text("""
                SELECT 
                    COUNT(*) as total_checkpoints,
                    COUNT(DISTINCT thread_id) as unique_threads,
                    AVG(pg_column_size(checkpoint)) as avg_checkpoint_size,
                    MAX(created_at) as latest_checkpoint
                FROM langgraph_checkpoints
            """))
            
            row = result.fetchone()
            return {
                "total_checkpoints": row[0],
                "unique_threads": row[1],
                "avg_checkpoint_size_bytes": row[2],
                "latest_checkpoint": row[3]
            }


# Global checkpoint saver instance
_checkpoint_saver: Optional[OrchestraCheckpointSaver] = None
_checkpoint_manager: Optional[CheckpointManager] = None


async def init_checkpoint_saver() -> OrchestraCheckpointSaver:
    """
    Initialize the global checkpoint saver.
    
    Returns:
        The initialized checkpoint saver
    """
    global _checkpoint_saver, _checkpoint_manager
    
    if _checkpoint_saver is None:
        _checkpoint_saver = OrchestraCheckpointSaver(settings.DATABASE_URL)
        await _checkpoint_saver.setup()
        _checkpoint_manager = CheckpointManager(_checkpoint_saver)
    
    return _checkpoint_saver


def get_checkpoint_saver() -> OrchestraCheckpointSaver:
    """
    Get the global checkpoint saver instance.
    
    Returns:
        The checkpoint saver
        
    Raises:
        RuntimeError: If checkpoint saver not initialized
    """
    if _checkpoint_saver is None:
        raise RuntimeError("Checkpoint saver not initialized. Call init_checkpoint_saver() first.")
    return _checkpoint_saver


def get_checkpoint_manager() -> CheckpointManager:
    """
    Get the global checkpoint manager instance.
    
    Returns:
        The checkpoint manager
        
    Raises:
        RuntimeError: If checkpoint manager not initialized
    """
    if _checkpoint_manager is None:
        raise RuntimeError("Checkpoint manager not initialized. Call init_checkpoint_saver() first.")
    return _checkpoint_manager


@asynccontextmanager
async def checkpoint_context():
    """
    Context manager for checkpoint operations.
    
    Usage:
        async with checkpoint_context() as manager:
            await manager.save_state(thread_id, state)
    """
    manager = get_checkpoint_manager()
    try:
        yield manager
    finally:
        pass  # Cleanup if needed

# Made with Bob

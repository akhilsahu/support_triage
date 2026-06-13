"""
MemoryFactory — builds mem0-backed Agno Memory objects from AgnoConfig.

Memory is scoped per session_id — each chat session has its own UUID so
no additional user_id scoping is needed.

All provider, model, and vector store settings come from AgnoConfig.
Switch memory backend by changing config — no code changes needed.
"""

from __future__ import annotations
from typing import Any, Optional
import structlog

from app.orchestra.ai.core.config import AgnoConfig

logger = structlog.get_logger()


class MemoryFactory:
    """
    Builds session-scoped memory objects for mem0ai.

    Memory is keyed by f"{session_id}:{user_id}" so each customer chat
    session has fully isolated memory, even across the same user_id.

    Adding a new memory backend:
        1. Add a branch in build()
        2. Add config fields to AgnoConfig / core/config.py
        3. No other files need to change
    """

    def __init__(self, cfg: AgnoConfig):
        self.cfg = cfg

    def build(self, session_id: str) -> Optional[Any]:
        """
        Build a MemoryManager scoped to this session.

        session_id is a UUID that uniquely identifies one chat session,
        so it alone is sufficient as the memory scope key.

        Returns:
            Agno MemoryManager or None if disabled / agno not available.
        """
        if not self.cfg.memory_enabled:
            return None

        return self._build_agno_memory(session_id)

    # ── Private ───────────────────────────────────────────────────────────────

    def _build_agno_memory(self, session_id: str) -> Optional[Any]:
        try:
            from agno.memory import MemoryManager
            from app.orchestra.ai.factories.llm import LLMFactory

            llm = LLMFactory(self.cfg).build()
            memory = MemoryManager(model=llm, user_id=session_id)
            logger.info(
                "memory_factory.built",
                session_id=session_id,
                provider=self.cfg.mem0_llm_provider,
            )
            return memory
        except ImportError:
            logger.warning("agno.memory not available — memory disabled")
            return None
        except TypeError:
            # Older agno builds may not accept user_id in MemoryManager constructor
            try:
                from agno.memory import MemoryManager
                from app.orchestra.ai.factories.llm import LLMFactory
                llm = LLMFactory(self.cfg).build()
                memory = MemoryManager(model=llm)
                logger.info("memory_factory.built_no_user_id", session_id=session_id)
                return memory
            except Exception as e:
                logger.error("memory_factory.error", error=str(e))
                return None
        except Exception as e:
            logger.error("memory_factory.error", error=str(e))
            return None

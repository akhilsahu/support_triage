"""
KnowledgeFactory — builds Agno Knowledge instances backed by ChromaDb.

Verified import paths (from installed agno package):
    from agno.knowledge import Knowledge
    from agno.vectordb.chroma import ChromaDb

Org/doc-type scoping:
  ChromaDb constructor has NO filter params.
  Filters go on the Agent via knowledge_filters= (passed to Knowledge.search()).
  KnowledgeFactory.build_filters() returns the right dict to pass to Agent.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
import structlog

from app.orchestra.ai.core.config import AgnoConfig

logger = structlog.get_logger()


class KnowledgeFactory:
    """
    Builds Agno Knowledge objects backed by ChromaDb.

    Usage pattern:
        factory = KnowledgeFactory(cfg)
        knowledge = factory.build()
        filters   = factory.build_filters(space_id, doc_types)
        # Pass both to AgentFactory — filters go on Agent, not Knowledge
    """

    def __init__(self, cfg: AgnoConfig):
        self.cfg = cfg

    def build(self) -> Optional[Any]:
        """
        Build a Knowledge instance backed by ChromaDb.
        No filters here — scoping is done via Agent.knowledge_filters.
        """
        try:
            from agno.knowledge import Knowledge
            from agno.vectordb.chroma import ChromaDb
        except ImportError:
            logger.warning("agno not installed — pip install agno")
            return None

        try:
            vector_db = ChromaDb(
                collection=self.cfg.chroma_collection,
                path=self.cfg.chroma_path,
                persistent_client=True,
            )
            kb = Knowledge(vector_db=vector_db)
            logger.info(
                "knowledge_factory.built",
                collection=self.cfg.chroma_collection,
                path=self.cfg.chroma_path,
            )
            return kb
        except Exception as e:
            logger.error("knowledge_factory.error", error=str(e))
            return None

    def build_filters(
        self,
        space_id:    str,
        doc_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Build the knowledge_filters dict to pass to Agent().

        These are passed to Knowledge.search(filters=...) → ChromaDb.search(filters=...)
        at query time, scoping results to this org's documents.

        Args:
            space_id:    str(org.id) UUID — stored as client_id in ChromaDB metadata
            doc_types: filter to these doc types; None = all org docs
        """
        if not doc_types:
            return {"client_id": space_id}

        if len(doc_types) == 1:
            return {"client_id": space_id, "doc_type": doc_types[0]}

        # Multiple doc types — use Agno FilterExpr
        try:
            from agno.filters import EQ, IN, AND
            return [EQ("client_id", space_id), IN("doc_type", doc_types)]
        except ImportError:
            # Fallback to plain dict (ChromaDb will handle it)
            return {"client_id": space_id}

    def build_from_texts(self, texts: List[str]) -> Optional[Any]:
        """In-memory knowledge base from raw strings. Useful for tests."""
        try:
            from agno.knowledge.text import TextKnowledge
            return TextKnowledge(text="\n\n".join(texts))
        except ImportError:
            logger.warning("agno not installed")
            return None
        except Exception as e:
            logger.error("knowledge_factory.text_error", error=str(e))
            return None

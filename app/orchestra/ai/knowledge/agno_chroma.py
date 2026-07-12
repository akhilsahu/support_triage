"""
AgnoChromaKnowledgeBackend — Agno Knowledge backed by ChromaDB.

Scoping (all ANDed at query time — see _make_filters):
  - space_id  → stored as "client_id" in ChromaDB metadata; hard tenant isolation.
  - doc_ids   → KnowledgeBase ids (resolved.kb_ids); matched against the "kb_id"
               chunk field so a custom agent only searches its linked KBs.
  - doc_types → categories (builtins: "policy", "product", etc.), matched on "doc_type".

One shared Knowledge instance per backend (ChromaDB collection is shared).
Filters are per-agent and passed via KnowledgeBundle.filters → Agent(knowledge_filters=...).

Set KNOWLEDGE_BACKEND=agno_chroma in .env to activate.
"""

from __future__ import annotations

from typing import Any, List, Optional
import structlog

from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend
from app.orchestra.ai.knowledge.bundle import KnowledgeBundle

logger = structlog.get_logger()


def _make_filters(
    space_id:  str,
    doc_ids:   Optional[List[str]],
    doc_types: Optional[List[str]],
) -> Any:
    """
    Build a ChromaDB-native where filter scoped to this agent.

    Layers (all ANDed):
      - client_id == space_id          → hard space/tenant isolation (always applied)
      - kb_id     $in doc_ids          → custom agents: only their linked KnowledgeBases
      - doc_type  $in doc_types        → builtin agents: only their configured categories

    Shape rules (dictated by agno's ChromaDb._convert_filters, verified against the
    installed version):
      - A single condition is returned as a FLAT {key: value} dict; _convert_filters
        wraps it into {"$eq": ...} / {"$in": ...}. Returning a pre-wrapped single
        condition would be double-wrapped ({"$eq": {"$eq": ...}}) and break.
      - Multiple conditions are returned as an explicit top-level {"$and": [...]} with
        fully-formed operator sub-dicts. A key starting with "$" makes _convert_filters
        pass the dict through untouched, so the sub-conditions must already be wrapped.
    """
    conds: List[Any] = [{"client_id": {"$eq": space_id}}]

    if doc_ids:
        # `doc_ids` carries KnowledgeBase ids (from resolved.kb_ids), which match the
        # `kb_id` chunk-metadata field written at ingestion — NOT the `doc_id` field.
        conds.append({"kb_id": {"$in": list(doc_ids)}})

    if doc_types:
        conds.append({"doc_type": {"$in": list(doc_types)}})

    if len(conds) == 1:
        # Single condition → flat form so _convert_filters wraps it correctly.
        return {"client_id": space_id}

    return {"$and": conds}


class AgnoChromaKnowledgeBackend(BaseKnowledgeBackend):
    """
    Agno-native knowledge backend using ChromaDB as the vector store.

    A single Knowledge instance wraps the shared ChromaDB collection.
    Per-agent scoping is done via filters (not separate collections).
    """

    def __init__(
        self,
        chroma_path:       str,
        chroma_collection: str,
        embedding_model:   str = "text-embedding-3-small",
    ):
        self._chroma_path       = chroma_path
        self._chroma_collection = chroma_collection
        self._embedding_model   = embedding_model
        self._knowledge: Optional[Any] = None

    def _get_knowledge(self) -> Optional[Any]:
        if self._knowledge is not None:
            return self._knowledge
        try:
            from agno.knowledge import Knowledge
            from agno.vectordb.chroma import ChromaDb
            from agno.vectordb.search import SearchType
            from app.config import settings
            from app.orchestra.ai.embedding import build_agno_embedder

            # Built from the shared embedding config so read-path model +
            # dimensions always match what the write path stored.
            embedder = build_agno_embedder()

            from app.orchestra.ai.knowledge.reranking import build_reranker
            reranker = build_reranker()

            vector_db = ChromaDb(
                name=self._chroma_collection,
                collection=self._chroma_collection,
                path=self._chroma_path,
                persistent_client=True,
                embedder=embedder,
                search_type=SearchType.hybrid,
                reranker=reranker,
            )
            # Over-fetch when reranking so the reranker has candidates to reorder
            # down to RERANK_TOP_N; otherwise just fetch the final top-k.
            max_results = settings.RERANK_FETCH_K if reranker else settings.RAG_TOP_K

            self._knowledge = Knowledge(vector_db=vector_db, max_results=max_results)
            logger.info(
                "knowledge.agno_chroma.init",
                collection=self._chroma_collection,
                path=self._chroma_path,
                reranker=type(reranker).__name__ if reranker else None,
                max_results=max_results,
            )
        except ImportError:
            logger.warning("knowledge.agno_chroma.missing_dep", dep="agno")
        except Exception as e:
            logger.error("knowledge.agno_chroma.init_error", error=str(e))
        return self._knowledge

    def for_agent(
        self,
        space_id:  str,
        doc_ids:   Optional[List[str]] = None,
        doc_types: Optional[List[str]] = None,
    ) -> KnowledgeBundle:
        knowledge = self._get_knowledge()
        if not knowledge:
            return KnowledgeBundle.empty()

        # An agent MUST bring its own scoping — linked KB(s) (doc_ids) or, for
        # builtins, categories (doc_types). With neither, we return NO knowledge
        # rather than falling back to a space-wide search: an unscoped agent must
        # not be able to read every document in the space.
        if not doc_ids and not doc_types:
            logger.info("knowledge.agno_chroma.no_scope", space_id=space_id)
            return KnowledgeBundle.empty()

        filters = _make_filters(space_id, doc_ids, doc_types)
        logger.debug(
            "knowledge.agno_chroma.bundle",
            space_id=space_id,
            doc_ids=doc_ids,
            doc_types=doc_types,
        )
        return KnowledgeBundle(knowledge=knowledge, filters=filters)

    def name(self) -> str:
        return "agno_chroma"

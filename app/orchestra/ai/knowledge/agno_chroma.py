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
    space_id:         str,
    doc_ids:          Optional[List[str]],
    doc_types:        Optional[List[str]],
    topics:           Optional[List[str]] = None,
    specific_doc_ids: Optional[List[str]] = None,
    kb_assignments:  Optional[List[dict]] = None,
) -> Any:
    """
    Build a ChromaDB-native where filter scoped to this agent.

    Layers (all ANDed):
      - client_id == space_id          → hard space/tenant isolation (always applied)
      - kb_assignments                 → custom agents: per-KB link conditions (full KB vs doc-level)
      - kb_id     $in doc_ids          → custom agents legacy fallback: linked KnowledgeBases
      - doc_id    $in specific_doc_ids → custom agents legacy fallback: specific documents inside KBs
      - doc_type  $in doc_types        → builtin agents: only their configured categories
      - topic     $in topics           → agents narrowed to specific topics
    """
    conds: List[Any] = [{"client_id": {"$eq": space_id}}]

    if kb_assignments:
        kb_conds: List[Any] = []
        for asgn in kb_assignments:
            k_id = asgn.get("kb_id")
            d_ids = asgn.get("doc_ids") or []
            if not k_id:
                continue
            if d_ids:
                if len(d_ids) == 1:
                    kb_conds.append({"$and": [{"kb_id": {"$eq": k_id}}, {"doc_id": {"$eq": d_ids[0]}}]})
                else:
                    kb_conds.append({"$and": [{"kb_id": {"$eq": k_id}}, {"doc_id": {"$in": list(d_ids)}}]})
            else:
                kb_conds.append({"kb_id": {"$eq": k_id}})

        if len(kb_conds) == 1:
            conds.append(kb_conds[0])
        elif len(kb_conds) > 1:
            conds.append({"$or": kb_conds})
    else:
        if doc_ids:
            conds.append({"kb_id": {"$in": list(doc_ids)}})

        if specific_doc_ids:
            conds.append({"doc_id": {"$in": list(specific_doc_ids)}})

    if doc_types:
        conds.append({"doc_type": {"$in": list(doc_types)}})

    if topics:
        conds.append({"topic": {"$in": list(topics)}})

    if len(conds) == 1:
        return {"client_id": space_id}

    return {"$and": conds}


def scoped_to_doc(filters: Any, doc_id: str) -> Any:
    """Narrow an agent's filters to a single indexed document."""
    return _scoped(filters, {"doc_id": {"$eq": doc_id}})


def scoped_to_docs(filters: Any, doc_ids: List[str]) -> Any:
    """
    Narrow an agent's filters to every document describing one product.

    A product usually spans several documents (brochure + T&C + a shared fee
    schedule), so per-product retrieval searches them together as one budget
    slot rather than giving a product extra slots for having more files.
    """
    if len(doc_ids) == 1:
        return scoped_to_doc(filters, doc_ids[0])
    return _scoped(filters, {"doc_id": {"$in": list(doc_ids)}})


def _scoped(filters: Any, cond: dict) -> Any:
    """
    AND one more condition onto an agent's filters.

    Lives here because it has to obey the same shape rules as _make_filters: a
    flat single-condition dict has to be re-wrapped once it gains a second
    condition, or agno's _convert_filters double-wraps it.
    """
    if isinstance(filters, dict) and "$and" in filters:
        return {"$and": [*filters["$and"], cond]}

    # Flat single-condition form, e.g. {"client_id": "<uuid>"}.
    if isinstance(filters, dict) and filters:
        flat = [{k: {"$eq": v}} for k, v in filters.items()]
        return {"$and": [*flat, cond]}

    return cond


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
        space_id:         str,
        doc_ids:          Optional[List[str]] = None,
        doc_types:        Optional[List[str]] = None,
        topics:           Optional[List[str]] = None,
        specific_doc_ids: Optional[List[str]] = None,
        kb_assignments:  Optional[List[dict]] = None,
    ) -> KnowledgeBundle:
        knowledge = self._get_knowledge()
        if not knowledge:
            return KnowledgeBundle.empty()

        # An agent MUST bring its own scoping — linked KB(s) (doc_ids/specific_doc_ids/kb_assignments)
        # or, for builtins, categories (doc_types). With neither, we return NO knowledge.
        if not doc_ids and not doc_types and not specific_doc_ids and not kb_assignments:
            logger.info("knowledge.agno_chroma.no_scope", space_id=space_id)
            return KnowledgeBundle.empty()

        filters = _make_filters(space_id, doc_ids, doc_types, topics, specific_doc_ids, kb_assignments)
        logger.debug(
            "knowledge.agno_chroma.bundle",
            space_id=space_id,
            doc_ids=doc_ids,
            specific_doc_ids=specific_doc_ids,
            kb_assignments=kb_assignments,
            doc_types=doc_types,
            topics=topics,
        )
        return KnowledgeBundle(knowledge=knowledge, filters=filters)

    def name(self) -> str:
        return "agno_chroma"

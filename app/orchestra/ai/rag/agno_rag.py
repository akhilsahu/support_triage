"""
AgnoRAG — RAG backed by Agno's Knowledge + ChromaDb.

Use this when documents are indexed via Agno's ingestion pipeline
(which uses Agno's own embedding function). Do NOT mix with documents
indexed by VectorStoreRAG — the embedding spaces will not match.

Set RAG_BACKEND=agno to activate.
"""

from __future__ import annotations

from typing import Any, List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.rag.base import BaseRAG, RAGResult

logger = structlog.get_logger()


def _build_type_filters(space_id: str, doc_types: List[str]) -> Any:
    if len(doc_types) == 1:
        return {"client_id": space_id, "doc_type": doc_types[0]}
    try:
        from agno.filters import EQ, IN
        return [EQ("client_id", space_id), IN("doc_type", doc_types)]
    except ImportError:
        return {"client_id": space_id}


def _build_doc_id_filters(space_id: str, doc_ids: List[str]) -> Any:
    if len(doc_ids) == 1:
        return {"client_id": space_id, "doc_id": doc_ids[0]}
    try:
        from agno.filters import EQ, IN
        return [EQ("client_id", space_id), IN("doc_id", doc_ids)]
    except ImportError:
        return {"client_id": space_id}


class AgnoRAG(BaseRAG):
    """
    Wraps Agno Knowledge + ChromaDb.

    Requires documents to have been ingested via Agno's knowledge pipeline.
    Filters by client_id (= space_id) and doc_type via knowledge_filters.
    """

    def __init__(self, chroma_path: str, chroma_collection: str):
        self.chroma_path       = chroma_path
        self.chroma_collection = chroma_collection
        self._knowledge: Optional[Any] = None

    def _get_knowledge(self) -> Optional[Any]:
        if self._knowledge is not None:
            return self._knowledge
        try:
            from agno.knowledge import Knowledge
            from agno.vectordb.chroma import ChromaDb
            vector_db = ChromaDb(
                collection=self.chroma_collection,
                path=self.chroma_path,
                persistent_client=True,
            )
            self._knowledge = Knowledge(vector_db=vector_db)
        except ImportError:
            logger.warning("agno not installed — AgnoRAG unavailable")
        except Exception:
            logger.exception("agno_rag.knowledge_init_error")
        return self._knowledge

    async def fetch(
        self,
        message: str,
        space_id:  str,
        agents:  List[ResolvedAgent],
        top_k:   Optional[int] = None,
    ) -> RAGResult:
        knowledge = self._get_knowledge()
        if not knowledge:
            return RAGResult.empty()

        rag_agents = [
            a for a in agents
            if a.slug != "triage" and a.rag_enabled and (a.rag_doc_types_list or a.kb_ids)
        ]
        if not rag_agents:
            return RAGResult.empty()

        try:
            max_k     = top_k or max(a.rag_top_k for a in rag_agents)
            raw_docs: List[Any] = []

            # ── doc_type-based query (builtin agents + custom agents with doc_types) ──
            doc_types = list({dt for a in rag_agents for dt in a.rag_doc_types_list})
            if doc_types:
                filters = _build_type_filters(space_id, doc_types)
                results = knowledge.search(query=message, max_results=max_k, filters=filters)
                if results:
                    raw_docs.extend(results)

            # ── KB doc_id-based query (custom agents with attached KnowledgeBases) ──
            all_kb_ids = list({kid for a in rag_agents if not a.is_builtin for kid in a.kb_ids})
            if all_kb_ids:
                from app.orchestra.ai.rag.vectorstore_rag import _resolve_kb_doc_ids
                doc_ids = await _resolve_kb_doc_ids(all_kb_ids)
                if doc_ids:
                    filters = _build_doc_id_filters(space_id, doc_ids)
                    results = knowledge.search(query=message, max_results=max_k, filters=filters)
                    if results:
                        raw_docs.extend(results)

            if not raw_docs:
                return RAGResult.empty()

            # Deduplicate by content, keep up to max_k
            seen_texts: set = set()
            chunks, citations = [], []
            for doc in raw_docs:
                text = doc.content if hasattr(doc, "content") else str(doc)
                if text in seen_texts:
                    continue
                seen_texts.add(text)
                meta = doc.meta_data if hasattr(doc, "meta_data") else {}
                chunks.append(text)
                citations.append({
                    "filename": meta.get("filename") or meta.get("doc_name") or "Unknown",
                    "page":     meta.get("page", 0),
                    "section":  meta.get("section", ""),
                    "score":    round(meta.get("similarity", 0.0), 3),
                    "excerpt":  text[:200],
                })
                if len(chunks) >= max_k:
                    break

            logger.info("agno_rag.hit", space_id=space_id, chunks=len(chunks))
            return RAGResult(
                context="\n---\n".join(chunks),
                rag_hit=True,
                citations=citations,
            )

        except Exception:
            logger.exception("agno_rag.fetch_error", space_id=space_id)
            return RAGResult.empty()

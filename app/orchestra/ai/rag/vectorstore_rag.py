"""
VectorStoreRAG — RAG backed by the existing app.rag.vector_store.VectorStore.

Scoping logic:
  Builtin agents → filter by rag_doc_types (category-based)
  Custom agents  → filter by doc_ids resolved from their KnowledgeBases
                   (falls back to rag_doc_types if no KBs attached)

Uses the same ChromaDB path, collection (client_documents), and
OpenAI embedding function as DynamicAgentExecutor.
"""

from __future__ import annotations

from typing import List, Optional
import structlog

from app.agents.resolved_agent import ResolvedAgent
from app.orchestra.ai.rag.base import BaseRAG, RAGResult

logger = structlog.get_logger()


class VectorStoreRAG(BaseRAG):

    async def fetch(
        self,
        message:  str,
        space_id: str,
        agents:   List[ResolvedAgent],
        top_k:    Optional[int] = None,
    ) -> RAGResult:
        try:
            from app.rag.vector_store import (
                get_vector_store,
                client_doc_type_where,
                client_where,
                COLLECTION_CLIENT,
            )

            rag_agents = [a for a in agents if a.slug != "triage" and a.rag_enabled]
            if not rag_agents:
                return RAGResult.empty()

            store     = get_vector_store()
            all_hits: List[dict] = []

            for agent in rag_agents:
                agent_top_k = top_k or agent.rag_top_k

                if not agent.is_builtin and agent.kb_ids:
                    # Custom agent with KBs → query by kb_id directly
                    for kb_id in agent.kb_ids:
                        where = {"$and": [{"client_id": {"$eq": space_id}}, {"kb_id": {"$eq": kb_id}}]}
                        hits  = store.query(
                            collection=COLLECTION_CLIENT,
                            query_text=message,
                            top_k=agent_top_k,
                            where=where,
                        )
                        # Fall back to doc_id resolution for doc-type items (no kb_id in metadata)
                        if not hits:
                            doc_ids = await _resolve_kb_doc_ids([kb_id])
                            for doc_id in doc_ids:
                                hits = store.query(
                                    collection=COLLECTION_CLIENT,
                                    query_text=message,
                                    top_k=agent_top_k,
                                    where=client_where(space_id, doc_id=doc_id),
                                )
                                all_hits.extend(hits)
                        else:
                            all_hits.extend(hits)

                elif agent.rag_doc_types_list:
                    # Builtin agents (or custom without KBs) → category-based
                    for doc_type in agent.rag_doc_types_list:
                        where = client_doc_type_where(space_id, doc_type)
                        hits  = store.query(
                            collection=COLLECTION_CLIENT,
                            query_text=message,
                            top_k=agent_top_k,
                            where=where,
                        )
                        all_hits.extend(hits)

            if not all_hits:
                return RAGResult.empty()

            all_hits.sort(key=lambda h: h["score"], reverse=True)
            max_k = top_k or max(a.rag_top_k for a in rag_agents)

            seen, chunks, citations = set(), [], []
            for h in all_hits:
                if h["id"] not in seen:
                    seen.add(h["id"])
                    chunks.append(h["document"])
                    meta = h.get("metadata") or {}
                    citations.append({
                        "filename": meta.get("filename") or meta.get("doc_name") or "Unknown",
                        "page":     meta.get("page", 0),
                        "section":  meta.get("section", ""),
                        "score":    round(h["score"], 3),
                        "excerpt":  h["document"][:200],
                    })
                if len(chunks) >= max_k:
                    break

            logger.info("vectorstore_rag.hit", space_id=space_id, chunks=len(chunks))
            return RAGResult(
                context="\n---\n".join(chunks),
                rag_hit=True,
                citations=citations,
            )

        except Exception:
            logger.exception("vectorstore_rag.error", space_id=space_id)
            return RAGResult.empty()


async def _resolve_kb_doc_ids(kb_ids: List[str]) -> List[str]:
    """
    Load KnowledgeBaseItems for the given KB UUIDs and return all
    resolvable ChromaDB doc_ids (from 'doc' items and indexed text/qna items).
    """
    try:
        from app.core.database import AsyncSessionLocal as async_session_factory
        from app.models.knowledge_base import KnowledgeBaseItem
        from sqlalchemy import select
        import uuid as _uuid

        parsed = []
        for kid in kb_ids:
            try:
                parsed.append(_uuid.UUID(kid))
            except ValueError:
                pass
        if not parsed:
            return []

        async with async_session_factory() as db:
            result = await db.execute(
                select(KnowledgeBaseItem).where(
                    KnowledgeBaseItem.kb_id.in_(parsed)
                )
            )
            items = result.scalars().all()

        doc_ids = []
        for item in items:
            if item.item_type == "doc" and item.doc_id:
                doc_ids.append(item.doc_id)
            elif item.indexed_doc_id:
                # text/qna already indexed in ChromaDB
                doc_ids.append(item.indexed_doc_id)

        return list(set(doc_ids))

    except Exception:
        logger.exception("vectorstore_rag.resolve_kb_doc_ids_error")
        return []

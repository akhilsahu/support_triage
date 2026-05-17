"""
RAG Service — real vector search over policy documents and product catalog.

Replaces the previous keyword-based MockRAGService with ChromaDB-backed
semantic retrieval. Falls back to keyword scoring if ChromaDB is unavailable.
"""

from __future__ import annotations

from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum

import asyncio
import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger()


class PolicyDocument(str, Enum):
    REFUND_POLICY = "refund_policy"
    CREDIT_POLICY = "credit_policy"
    COMPENSATION_GUIDELINES = "compensation_guidelines"
    TERMS_OF_SERVICE = "terms_of_service"


class PolicySection(BaseModel):
    document: PolicyDocument
    section: str
    title: str
    content: str
    relevance_score: float = Field(ge=0.0, le=1.0)


class RAGResponse(BaseModel):
    query: str
    documents: List[PolicySection] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    total_results: int
    query_time_ms: int
    backend: str = "vector"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class RAGService:
    """
    Production RAG service backed by ChromaDB vector search.

    On init it seeds policy documents into the vector store (idempotent).
    Falls back to keyword scoring if ChromaDB / sentence-transformers are
    not available.
    """

    def __init__(self):
        self._store = None
        self._seeded = False
        self.query_count = 0
        self.total_query_time_ms = 0
        self._try_init()

    def _try_init(self):
        try:
            from app.rag.vector_store import get_vector_store, seed_policy_docs
            self._store = get_vector_store()
            seed_policy_docs(self._store)
            self._seeded = True
            logger.info("RAGService: vector store ready")
        except Exception as e:
            logger.warning("RAGService: ChromaDB unavailable, falling back to keyword search", error=str(e))

    # ── Public API ────────────────────────────────────────────────────────────

    async def query(
        self,
        query: str,
        documents: Optional[List[PolicyDocument]] = None,
        max_results: int = 3,
    ) -> RAGResponse:
        self.query_count += 1
        start = datetime.utcnow()

        if self._store and self._seeded:
            results = await self._vector_search(query, documents, max_results)
            backend = "vector"
        else:
            results = self._keyword_search(query, documents, max_results)
            backend = "keyword"

        confidence = self._calc_confidence(results)
        elapsed = int((datetime.utcnow() - start).total_seconds() * 1000)
        self.total_query_time_ms += elapsed

        return RAGResponse(
            query=query,
            documents=results,
            confidence=confidence,
            total_results=len(results),
            query_time_ms=elapsed,
            backend=backend,
        )

    async def query_products(
        self,
        query: str,
        top_k: int = 5,
        category: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Semantic product search via vector store."""
        if not self._store:
            return []
        try:
            from app.rag.vector_store import COLLECTION_PRODUCTS, seed_product_catalog
            seed_product_catalog(self._store)
            where = {"category": category} if category else None
            hits = self._store.query(COLLECTION_PRODUCTS, query, top_k=top_k, where=where, min_score=0.2)
            return hits
        except Exception as e:
            logger.error("Product vector search failed", error=str(e))
            return []

    def get_statistics(self) -> Dict[str, Any]:
        avg = self.total_query_time_ms / self.query_count if self.query_count else 0
        return {
            "total_queries": self.query_count,
            "avg_query_time_ms": round(avg, 2),
            "backend": "vector" if self._store else "keyword",
            "policy_docs_indexed": self._store.count("policy_documents") if self._store else 0,
            "products_indexed": self._store.count("product_catalog") if self._store else 0,
        }

    # ── Vector search ─────────────────────────────────────────────────────────

    async def _vector_search(
        self,
        query: str,
        doc_filter: Optional[List[PolicyDocument]],
        max_results: int,
    ) -> List[PolicySection]:
        from app.rag.vector_store import COLLECTION_POLICY

        where = None
        if doc_filter:
            doc_values = [d.value for d in doc_filter]
            where = {"doc": {"$in": doc_values}}

        hits = self._store.query(
            COLLECTION_POLICY,
            query,
            top_k=max_results,
            where=where,
            min_score=0.2,
        )

        results = []
        for h in hits:
            meta = h["metadata"]
            try:
                doc_enum = PolicyDocument(meta.get("doc", "refund_policy"))
            except ValueError:
                doc_enum = PolicyDocument.REFUND_POLICY

            results.append(
                PolicySection(
                    document=doc_enum,
                    section=meta.get("section", "0.0"),
                    title=meta.get("title", ""),
                    content=h["document"],
                    relevance_score=min(1.0, h["score"]),
                )
            )
        return results

    # ── Keyword fallback ──────────────────────────────────────────────────────

    _KEYWORD_CORPUS: List[Dict[str, Any]] = []  # populated lazily

    def _keyword_search(
        self,
        query: str,
        doc_filter: Optional[List[PolicyDocument]],
        max_results: int,
    ) -> List[PolicySection]:
        if not self._KEYWORD_CORPUS:
            self.__class__._KEYWORD_CORPUS = self._build_corpus()

        allowed = {d.value for d in doc_filter} if doc_filter else None
        q_words = set(query.lower().split())
        scored = []

        for entry in self._KEYWORD_CORPUS:
            if allowed and entry["doc"] not in allowed:
                continue
            c_words = set(entry["content"].lower().split())
            t_words = set(entry["title"].lower().split())
            score = (
                len(q_words & c_words) / max(len(q_words), 1) * 0.7
                + len(q_words & t_words) / max(len(q_words), 1) * 0.3
            )
            if score > 0.05:
                scored.append((score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for score, entry in scored[:max_results]:
            results.append(
                PolicySection(
                    document=PolicyDocument(entry["doc"]),
                    section=entry["section"],
                    title=entry["title"],
                    content=entry["content"],
                    relevance_score=min(1.0, score),
                )
            )
        return results

    @staticmethod
    def _build_corpus() -> List[Dict[str, Any]]:
        from app.rag.vector_store import POLICY_DOCS
        return [
            {
                "doc": d["meta"]["doc"],
                "section": d["meta"]["section"],
                "title": d["meta"]["title"],
                "content": d["text"],
            }
            for d in POLICY_DOCS
        ]

    @staticmethod
    def _calc_confidence(results: List[PolicySection]) -> float:
        if not results:
            return 0.0
        top = [r.relevance_score for r in results[:3]]
        return round(sum(top) / len(top) * min(1.0, len(results) / 3), 3)


# ── Singleton ─────────────────────────────────────────────────────────────────

_rag_service: Optional[RAGService] = None


def get_rag_service() -> RAGService:
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service

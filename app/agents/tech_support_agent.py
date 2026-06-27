"""
Tech Support Agent

Answers technical questions by retrieving relevant context from the
client's own knowledge base stored in ChromaDB (doc_type=tech_support).

Each client/brand uploads their troubleshooting guides, FAQs, and manuals
via the admin API. At query time, only that client's documents are searched —
another client's data is never exposed.

Flow:
  User question
    → query client_documents WHERE client_id=X AND doc_type=tech_support
    → inject retrieved chunks as context
    → LLM generates a grounded answer
    → return answer + source citations
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import structlog

from app.rag.vector_store import client_doc_type_where, get_vector_store
from app.services.llm_service import llm_service

logger = structlog.get_logger()


class TechSupportResult:
    """Result returned by TechSupportAgent.answer()"""

    def __init__(
        self,
        answer: str,
        client_id: str,
        sources: List[Dict[str, Any]],
        provider: Optional[str] = None,
        rag_hit: bool = True,
    ):
        self.answer = answer
        self.client_id = client_id
        self.sources = sources       # [{filename, page, section, score, excerpt}]
        self.provider = provider
        self.rag_hit = rag_hit       # False if no relevant docs found

    def to_dict(self) -> Dict[str, Any]:
        return {
            "answer":    self.answer,
            "client_id": self.client_id,
            "sources":   self.sources,
            "provider":  self.provider,
            "rag_hit":   self.rag_hit,
        }


class TechSupportAgent:
    """
    Answers technical support questions using client-specific knowledge base.

    Each client stores their own tech docs in ChromaDB tagged with:
      client_id = their unique tenant ID
      doc_type  = "tech_support"

    Queries are automatically scoped to the requesting client — no cross-client
    data leakage is possible because the where-filter is built from client_id.
    """

    DEFAULT_TOP_K   = 5
    DEFAULT_MIN_SCORE = 0.15
    MAX_CONTEXT_CHUNKS = 4

    def __init__(self):
        self._store = None

    @property
    def store(self):
        if self._store is None:
            self._store = get_vector_store()
        return self._store

    async def answer(
        self,
        question: str,
        client_id: str,
        doc_id: Optional[str] = None,
        top_k: int = DEFAULT_TOP_K,
        ticket_id: Optional[str] = None,
    ) -> TechSupportResult:
        """
        Answer a technical question using the client's knowledge base.

        Args:
            question:  The user's technical question.
            client_id: Tenant / brand identifier — scopes the search.
            doc_id:    Optional — narrow search to a specific uploaded doc.
            top_k:     Max chunks to retrieve.
            ticket_id: For logging.

        Returns:
            TechSupportResult with answer and source citations.
        """
        logger.info(
            "TechSupportAgent query",
            client_id=client_id,
            doc_id=doc_id,
            question=question[:80],
            ticket_id=ticket_id,
        )

        # ── 1. Retrieve relevant chunks from this client's tech docs ──────────
        where = client_doc_type_where(client_id, "tech_support", doc_id=doc_id)
        hits = self.store.query(
            collection="client_documents",
            query_text=question,
            top_k=top_k,
            where=where,
            min_score=self.DEFAULT_MIN_SCORE,
        )

        # ── 2. No relevant docs found ─────────────────────────────────────────
        if not hits:
            logger.info(
                "No tech support docs found for client",
                client_id=client_id,
                question=question[:60],
            )
            return TechSupportResult(
                answer=(
                    "I couldn't find relevant documentation to answer your question. "
                    "Please contact your support team or check the official documentation."
                ),
                client_id=client_id,
                sources=[],
                rag_hit=False,
            )

        # ── 3. Build context from top chunks ──────────────────────────────────
        top_hits = hits[: self.MAX_CONTEXT_CHUNKS]
        context_parts = []
        for h in top_hits:
            meta = h["metadata"]
            label = f"[{meta.get('filename', 'doc')} · Page {meta.get('page', '?')}"
            if meta.get("section"):
                label += f" · {meta['section']}"
            label += "]"
            context_parts.append(f"{label}\n{h['document']}")
        context = "\n\n".join(context_parts)

        # ── 4. LLM call with retrieved context ────────────────────────────────
        system = (
            "You are a technical support specialist. "
            "Use ONLY the provided documentation excerpts to answer the question. "
            "If the answer is not in the context, say so clearly and suggest contacting support. "
            "Be concise and step-by-step where appropriate. "
            "Cite the source document and page number when relevant."
        )
        messages = [
            {
                "role": "user",
                "content": f"Documentation:\n{context}\n\nQuestion: {question}",
            }
        ]

        llm_result = await llm_service.generate_with_fallback(
            messages=messages,
            system_prompt=system,
            temperature=0.2,
            max_tokens=600,
        )

        if llm_result:
            answer = llm_result["content"]
            provider = llm_result.get("provider")
        else:
            # Fallback: return best matching chunk directly
            best = top_hits[0]
            answer = (
                f"**{best['metadata'].get('filename', 'Documentation')} "
                f"(Page {best['metadata'].get('page', '?')}):**\n\n"
                f"{best['document'][:600]}"
            )
            provider = "fallback"

        # ── 5. Build source citations ─────────────────────────────────────────
        sources = [
            {
                "filename":    h["metadata"].get("filename", ""),
                "page":        h["metadata"].get("page", 0),
                "section":     h["metadata"].get("section", ""),
                "score":       h["score"],
                "excerpt":     h["document"][:200] + ("…" if len(h["document"]) > 200 else ""),
            }
            for h in top_hits[:3]
        ]

        logger.info(
            "TechSupportAgent answered",
            client_id=client_id,
            chunks_used=len(top_hits),
            provider=provider,
        )

        return TechSupportResult(
            answer=answer,
            client_id=client_id,
            sources=sources,
            provider=provider,
            rag_hit=True,
        )


# ── Singleton ──────────────────────────────────────────────────────────────────

_tech_support_agent: Optional[TechSupportAgent] = None


def get_tech_support_agent() -> TechSupportAgent:
    global _tech_support_agent
    if _tech_support_agent is None:
        _tech_support_agent = TechSupportAgent()
    return _tech_support_agent

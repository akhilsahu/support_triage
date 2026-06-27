"""
Support Agent

Answers customer questions by retrieving relevant context from the org's
knowledge base stored in ChromaDB. Searches ALL doc types uploaded by the org
(policy, tech_support, manual, faq, catalog, general).

Flow:
  Customer question
    → query client_documents WHERE client_id = str(org.id)   # UUID, never slug
    → inject retrieved chunks as context
    → LLM generates a grounded answer
    → return answer + source citations
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import structlog

from app.rag.vector_store import client_where, get_vector_store
from app.services.llm_service import llm_service

logger = structlog.get_logger()


class SupportResult:
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
        self.sources = sources
        self.provider = provider
        self.rag_hit = rag_hit

    def to_dict(self) -> Dict[str, Any]:
        return {
            "answer":    self.answer,
            "client_id": self.client_id,
            "sources":   self.sources,
            "provider":  self.provider,
            "rag_hit":   self.rag_hit,
        }


class SupportAgent:
    """
    Answers customer questions using the org's full knowledge base.

    Searches all doc types uploaded by the org — policies, manuals, FAQs,
    tech guides, catalogs — scoped strictly to that org's client_id (slug).
    """

    DEFAULT_TOP_K      = 5
    DEFAULT_MIN_SCORE  = 0.15
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
    ) -> SupportResult:
        """
        Answer a customer question using the org's knowledge base.

        Args:
            question:  The customer's question.
            client_id: str(org.id) UUID — scopes the ChromaDB search to this org only. Never use slug.
            doc_id:    Optional — narrow to a specific uploaded doc.
            top_k:     Max chunks to retrieve.
            ticket_id: For logging.
        """
        logger.info("SupportAgent query", client_id=client_id, question=question[:80], ticket_id=ticket_id)

        # Search ALL doc types for this org (no doc_type filter)
        where = client_where(client_id, doc_id=doc_id)
        hits = self.store.query(
            collection="client_documents",
            query_text=question,
            top_k=top_k,
            where=where,
            min_score=self.DEFAULT_MIN_SCORE,
        )

        if not hits:
            logger.info("No KB docs found for org", client_id=client_id)
            return SupportResult(
                answer=(
                    "I couldn't find relevant information in the knowledge base. "
                    "Please contact support directly for further assistance."
                ),
                client_id=client_id,
                sources=[],
                rag_hit=False,
            )

        top_hits = hits[: self.MAX_CONTEXT_CHUNKS]
        context_parts = []
        for h in top_hits:
            meta = h["metadata"]
            label = f"[{meta.get('doc_name') or meta.get('filename', 'doc')} · Page {meta.get('page', '?')}"
            if meta.get("section"):
                label += f" · {meta['section']}"
            label += f" · {meta.get('doc_type', '')}]"
            context_parts.append(f"{label}\n{h['document']}")
        context = "\n\n".join(context_parts)

        system = (
            "You are a helpful support assistant for this organisation. "
            "Use ONLY the provided knowledge base excerpts to answer the customer's question. "
            "If the answer is not in the context, say so and suggest contacting support. "
            "Be concise, friendly, and cite the source document and page when relevant."
        )
        messages = [{"role": "user", "content": f"Knowledge Base:\n{context}\n\nCustomer question: {question}"}]

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
            best = top_hits[0]
            answer = (
                f"**{best['metadata'].get('doc_name') or best['metadata'].get('filename', 'Documentation')} "
                f"(Page {best['metadata'].get('page', '?')}):**\n\n"
                f"{best['document'][:600]}"
            )
            provider = "fallback"

        sources = [
            {
                "filename": h["metadata"].get("doc_name") or h["metadata"].get("filename", ""),
                "doc_type": h["metadata"].get("doc_type", ""),
                "page":     h["metadata"].get("page", 0),
                "section":  h["metadata"].get("section", ""),
                "score":    h["score"],
                "excerpt":  h["document"][:200] + ("…" if len(h["document"]) > 200 else ""),
            }
            for h in top_hits[:3]
        ]

        logger.info("SupportAgent answered", client_id=client_id, chunks_used=len(top_hits), provider=provider)

        return SupportResult(
            answer=answer,
            client_id=client_id,
            sources=sources,
            provider=provider,
            rag_hit=True,
        )


# ── Singleton ──────────────────────────────────────────────────────────────────

_support_agent: Optional[SupportAgent] = None


def get_support_agent() -> SupportAgent:
    global _support_agent
    if _support_agent is None:
        _support_agent = SupportAgent()
    return _support_agent


# Backwards-compat aliases so old imports don't break
TechSupportAgent   = SupportAgent
TechSupportResult  = SupportResult
get_tech_support_agent = get_support_agent

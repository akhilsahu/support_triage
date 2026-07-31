"""
Per-product retrieval — one knowledge search per document, results merged.

An agent whose knowledge base holds several products retrieves once over the
whole KB, so whichever product ranks best takes the entire top-k. Measured on
the SBI cards KB: "annual fee" returned chunks from both cards and both were
answered, but "reward points" returned one chunk per card, the Prime one ranked
higher, and the answer covered Prime only — the exact silent single-product
answer MULTI_PRODUCT_DIRECTIVES exists to prevent. A prompt cannot fix it: the
model can only answer for products that were actually retrieved.

Splitting the same budget across documents guarantees every product is
represented. Total chunks returned stay at RERANK_TOP_N, so context cost is
unchanged; the cost is N searches (and N rerank calls) instead of one, run
concurrently. ResolvedAgent caps N at _MAX_PRODUCTS.

Installed via Agent(knowledge_retriever=...), which agno uses for both the
add_knowledge_to_context pre-fetch and the search_knowledge_base tool.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Dict, List

import structlog

from app.orchestra.ai.knowledge.agno_chroma import scoped_to_doc

logger = structlog.get_logger()


def build_per_product_retriever(
    knowledge:    Any,
    base_filters: Any,
    doc_ids:      List[str],
    top_n:        int,
    fetch_k:      int,
) -> Callable:
    """
    Return an async agno knowledge_retriever that searches each document
    separately and interleaves the results.

    Args:
        knowledge:    the shared agno Knowledge instance
        base_filters: the agent's own scoping filters, narrowed per document
        doc_ids:      indexed document ids, one per product
        top_n:        total chunks to return across all products
        fetch_k:      total candidates to pull before reranking
    """
    n        = len(doc_ids)
    per_doc  = max(1, top_n // n)
    fetch    = max(per_doc, fetch_k // n)

    # `filters` is deliberately absent from the signature: agno only passes it
    # when declared, and the search_knowledge_base path runs it through
    # validate_filters first, which strips the "$and" form we build. Using the
    # filters captured at build time keeps scoping identical on both paths.
    async def retrieve(query: str, **_: Any) -> List[Dict[str, Any]]:
        hits = await asyncio.gather(*[
            knowledge.asearch(
                query=query,
                max_results=fetch,
                filters=scoped_to_doc(base_filters, doc_id),
            )
            for doc_id in doc_ids
        ])

        # Round-robin so each product's best chunk appears before any product's
        # second — a truncated context still covers every product.
        capped = [h[:per_doc] for h in hits]
        merged: List[Dict[str, Any]] = []
        for rank in range(per_doc):
            for docs in capped:
                if rank < len(docs):
                    merged.append(docs[rank].to_dict())

        logger.info(
            "knowledge.per_product.retrieve",
            products=n,
            per_doc=per_doc,
            found=[len(h) for h in hits],
            returned=len(merged),
        )
        return merged

    return retrieve

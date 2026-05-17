"""
RAG System — standalone runner.

Usage:
    # From project root:
    python -m app.rag.main

    # Or directly:
    python app/rag/main.py

Commands (interactive mode):
    q <query>          — search policy documents
    p <query>          — search product catalog
    seed               — (re)seed all documents
    stats              — show vector store stats
    collections        — list ChromaDB collections
    exit               — quit
"""

from __future__ import annotations

import asyncio
import sys
import os

# Allow running from project root without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


def _banner():
    print("\n" + "=" * 60)
    print("  OrchestraSupport — RAG System")
    print("  Backend: ChromaDB  |  Embeddings: sentence-transformers")
    print("=" * 60 + "\n")


def _init_store():
    from app.rag.vector_store import get_vector_store, seed_policy_docs, seed_product_catalog
    store = get_vector_store()
    print("📂  Seeding policy documents...")
    n = seed_policy_docs(store)
    print(f"    ✓ Policy docs: {store.count('policy_documents')} indexed ({n} new)")

    print("🛒  Seeding product catalog...")
    n = seed_product_catalog(store)
    print(f"    ✓ Products: {store.count('product_catalog')} indexed ({n} new)\n")
    return store


async def _run_policy_query(rag, query: str):
    print(f"\n🔍  Policy search: \"{query}\"")
    response = await rag.query(query, max_results=3)
    print(f"    Backend: {response.backend}  |  Confidence: {response.confidence:.0%}  |  {response.query_time_ms}ms\n")
    if not response.documents:
        print("    No relevant policy sections found.")
        return
    for i, doc in enumerate(response.documents, 1):
        print(f"  [{i}] [{doc.document.value} §{doc.section}] {doc.title}  (score: {doc.relevance_score:.2f})")
        print(f"      {doc.content[:160]}{'...' if len(doc.content) > 160 else ''}\n")


def _run_product_query(store, query: str):
    from app.rag.vector_store import COLLECTION_PRODUCTS, seed_product_catalog
    seed_product_catalog(store)
    print(f"\n🛍️   Product search: \"{query}\"")
    hits = store.query(COLLECTION_PRODUCTS, query, top_k=5, min_score=0.15)
    if not hits:
        print("    No matching products found.")
        return
    for h in hits:
        m = h["metadata"]
        print(
            f"  • {m.get('name')}  |  ${m.get('price')}  |  "
            f"Stock: {m.get('stock')}  |  ⭐ {m.get('rating')}  "
            f"(score: {h['score']:.2f})"
        )
    print()


def _show_stats(store, rag):
    print("\n📊  Vector Store Stats")
    print(f"    Collections: {store.list_collections()}")
    print(f"    Policy docs: {store.count('policy_documents')}")
    print(f"    Products:    {store.count('product_catalog')}")
    s = rag.get_statistics()
    print(f"    Queries run: {s['total_queries']}  |  Avg: {s['avg_query_time_ms']}ms")
    print(f"    Backend:     {s['backend']}\n")


async def demo(store, rag):
    """Run a pre-set demo without interactive input."""
    print("━" * 60)
    print("DEMO — Policy Queries")
    print("━" * 60)

    queries = [
        "Can I get a refund for a damaged item?",
        "How much store credit do I get for a late delivery?",
        "What happens if the wrong item was shipped to me?",
        "Are there goodwill gestures for frustrated customers?",
    ]
    for q in queries:
        await _run_policy_query(rag, q)

    print("━" * 60)
    print("DEMO — Product Searches")
    print("━" * 60)

    product_queries = [
        "wireless noise cancelling headphones",
        "mechanical keyboard RGB",
        "portable SSD fast storage",
    ]
    for q in product_queries:
        _run_product_query(store, q)

    _show_stats(store, rag)


async def interactive(store, rag):
    """Interactive REPL."""
    print("Commands:  q <text>  |  p <text>  |  seed  |  stats  |  collections  |  exit\n")
    while True:
        try:
            line = input("rag> ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not line:
            continue
        if line in ("exit", "quit"):
            break
        if line == "stats":
            _show_stats(store, rag)
        elif line == "collections":
            print(f"  Collections: {store.list_collections()}\n")
        elif line == "seed":
            from app.rag.vector_store import seed_policy_docs, seed_product_catalog
            seed_policy_docs(store, force=True)
            seed_product_catalog(store, force=True)
            print("  Reseeded.\n")
        elif line.startswith("q "):
            await _run_policy_query(rag, line[2:])
        elif line.startswith("p "):
            _run_product_query(store, line[2:])
        else:
            print("  Unknown command. Use:  q <text>  |  p <text>  |  stats  |  exit\n")


async def main():
    _banner()

    print("🚀  Initialising vector store...")
    store = _init_store()

    from app.services.rag_service import get_rag_service
    rag = get_rag_service()

    mode = sys.argv[1] if len(sys.argv) > 1 else "demo"

    if mode == "interactive" or mode == "-i":
        await interactive(store, rag)
    else:
        await demo(store, rag)

    print("Done.\n")


if __name__ == "__main__":
    asyncio.run(main())

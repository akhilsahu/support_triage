"""
test_kb_rag.py — end-to-end smoke test for KB text/qna RAG indexing + retrieval.

Tests the full chain:
  1. Index a text item  → indexed_doc_id written to DB
  2. Index a qna item   → indexed_doc_id written to DB
  3. _resolve_kb_doc_ids returns both doc_ids
  4. ChromaDB actually holds those chunks
  5. store.query() returns hits for a relevant query

Usage:
    PYTHONPATH=. venv/bin/python tests/test_kb_rag.py
    # or with a real KB UUID already in the DB:
    KB_ID=<uuid> ORG_ID=<org-uuid> PYTHONPATH=. venv/bin/python tests/test_kb_rag.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
RESET  = "\033[0m"

def ok(msg: str)   -> None: print(f"{GREEN}  ✓ {msg}{RESET}")
def fail(msg: str) -> None: print(f"{RED}  ✗ {msg}{RESET}"); sys.exit(1)
def info(msg: str) -> None: print(f"{YELLOW}  · {msg}{RESET}")


# ── Config ────────────────────────────────────────────────────────────────────

# When KB_ID + ORG_ID are set in the environment the script uses that real KB
# and skips the synthetic indexing step (useful for prod DB smoke-tests).
REAL_KB_ID  = os.getenv("KB_ID")
REAL_ORG_ID = os.getenv("ORG_ID")
QUERY_TEXT  = os.getenv("QUERY_TEXT", "return policy")


# ── Synthetic test (no DB write needed) ───────────────────────────────────────

def test_index_and_query_synthetic() -> None:
    """
    Index two in-memory chunks directly into ChromaDB under a temporary
    client_id, query them back, then delete the chunks.
    """
    print("\n[1] Synthetic index + query (no DB)")

    from app.rag.vector_store import get_vector_store, client_where, COLLECTION_CLIENT

    store     = get_vector_store()
    client_id = f"test-{uuid.uuid4().hex[:8]}"
    doc_id_txt = uuid.uuid4().hex[:8]
    doc_id_qna = uuid.uuid4().hex[:8]

    # --- index text chunk ---
    store.upsert_client_chunks(
        client_id=client_id,
        session_id="kb",
        doc_id=doc_id_txt,
        filename="synthetic-text",
        extension=".txt",
        strategy="inline",
        doc_type="general",
        ttl_days=None,
        kb_name="",
        space_id=client_id,
        org_name="test-org",
        chunks=[{"text": "Acme widget returns are free within 30 days of purchase.", "page": 1, "chunk_index": 0, "section": ""}],
    )
    ok(f"text chunk upserted  doc_id={doc_id_txt}")

    # --- index qna chunk ---
    store.upsert_client_chunks(
        client_id=client_id,
        session_id="kb",
        doc_id=doc_id_qna,
        filename="synthetic-qna",
        extension=".txt",
        strategy="inline",
        doc_type="general",
        ttl_days=None,
        kb_name="",
        space_id=client_id,
        org_name="test-org",
        chunks=[{"text": "Q: How do I return a product?\nA: Email support@acme.com within 30 days.", "page": 1, "chunk_index": 0, "section": ""}],
    )
    ok(f"qna  chunk upserted  doc_id={doc_id_qna}")

    # --- query text ---
    hits = store.query(
        collection=COLLECTION_CLIENT,
        query_text=QUERY_TEXT,
        top_k=5,
        where=client_where(client_id, doc_id=doc_id_txt),
    )
    if not hits:
        fail(f"text chunk not retrieved for query='{QUERY_TEXT}'")
    ok(f"text chunk retrieved  score={hits[0]['score']:.3f}  excerpt={hits[0]['document'][:60]!r}")

    # --- query qna ---
    hits = store.query(
        collection=COLLECTION_CLIENT,
        query_text=QUERY_TEXT,
        top_k=5,
        where=client_where(client_id, doc_id=doc_id_qna),
    )
    if not hits:
        fail(f"qna chunk not retrieved for query='{QUERY_TEXT}'")
    ok(f"qna  chunk retrieved  score={hits[0]['score']:.3f}  excerpt={hits[0]['document'][:60]!r}")

    # --- cleanup ---
    col = store._collection(COLLECTION_CLIENT)
    all_ids = col.get(where={"client_id": {"$eq": client_id}})["ids"]
    if all_ids:
        col.delete(ids=all_ids)
    info(f"cleanup: removed {len(all_ids)} test chunks")


# ── Real-DB test ───────────────────────────────────────────────────────────────

async def test_resolve_and_query_real(kb_id: str, org_id: str) -> None:
    """
    Load real KnowledgeBaseItems from the DB, verify indexed_doc_id is set for
    text/qna items, and confirm store.query() returns hits.
    """
    print(f"\n[2] Real-DB test  kb_id={kb_id}  org_id={org_id}")

    from app.orchestra.ai.rag.vectorstore_rag import _resolve_kb_doc_ids
    from app.rag.vector_store import get_vector_store, client_where, COLLECTION_CLIENT
    from app.core.database import AsyncSessionLocal
    from app.models.knowledge_base import KnowledgeBaseItem
    from sqlalchemy import select

    # --- check DB rows ---
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(KnowledgeBaseItem).where(
                KnowledgeBaseItem.kb_id == uuid.UUID(kb_id)
            )
        )
        items = result.scalars().all()

    if not items:
        fail(f"No KnowledgeBaseItems found for kb_id={kb_id}")

    info(f"Found {len(items)} items in KB")
    unindexed = []
    for item in items:
        if item.item_type in ("text", "qna"):
            if not item.indexed_doc_id:
                unindexed.append(str(item.id))
            else:
                ok(f"  item {str(item.id)[:8]} ({item.item_type})  indexed_doc_id={item.indexed_doc_id}")

    if unindexed:
        fail(
            f"{len(unindexed)} text/qna item(s) have no indexed_doc_id — "
            f"they were never indexed into ChromaDB: {unindexed}"
        )

    # --- resolve doc_ids ---
    doc_ids = await _resolve_kb_doc_ids([kb_id])
    if not doc_ids:
        fail("_resolve_kb_doc_ids returned empty list")
    ok(f"_resolve_kb_doc_ids → {doc_ids}")

    # --- query each doc_id ---
    store = get_vector_store()
    any_hit = False
    for doc_id in doc_ids:
        hits = store.query(
            collection=COLLECTION_CLIENT,
            query_text=QUERY_TEXT,
            top_k=3,
            where=client_where(org_id, doc_id=doc_id),
        )
        if hits:
            any_hit = True
            ok(f"doc_id={doc_id}  top_hit score={hits[0]['score']:.3f}  excerpt={hits[0]['document'][:60]!r}")
        else:
            info(f"doc_id={doc_id}  no hits for query='{QUERY_TEXT}' (try a different QUERY_TEXT)")

    if not any_hit:
        fail(
            f"No hits returned for any doc_id with query='{QUERY_TEXT}'. "
            "Set QUERY_TEXT to a phrase that appears in the KB content."
        )


# ── Entrypoint ────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("  KB RAG smoke test")
    print("=" * 60)

    test_index_and_query_synthetic()

    if REAL_KB_ID and REAL_ORG_ID:
        asyncio.run(test_resolve_and_query_real(REAL_KB_ID, REAL_ORG_ID))
    else:
        print(f"\n{YELLOW}[2] Skipped real-DB test — set KB_ID and ORG_ID env vars to enable{RESET}")

    print(f"\n{GREEN}All checks passed.{RESET}\n")


if __name__ == "__main__":
    main()

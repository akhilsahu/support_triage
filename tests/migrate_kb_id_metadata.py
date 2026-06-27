"""
migrate_kb_id_metadata.py — backfill kb_id + kb_name into existing ChromaDB chunks.

For each KnowledgeBaseItem that has an indexed_doc_id (text/qna) or doc_id (doc),
finds the matching chunks in ChromaDB and updates their metadata with:
  kb_id   = str(KnowledgeBase.id)
  kb_name = KnowledgeBase.name

Usage:
    # All KBs
    PYTHONPATH=. venv/bin/python tests/migrate_kb_id_metadata.py

    # Single KB
    KB_ID=485dc074-3972-4cba-8bf0-d42225a1d0c9 \
      PYTHONPATH=. venv/bin/python tests/migrate_kb_id_metadata.py

    # Dry-run
    DRY_RUN=1 PYTHONPATH=. venv/bin/python tests/migrate_kb_id_metadata.py
"""

from __future__ import annotations

import asyncio
import os

import app.models  # noqa: F401 — registers all SQLAlchemy mappers

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem

TARGET_KB_ID = os.getenv("KB_ID")
DRY_RUN      = os.getenv("DRY_RUN", "0") == "1"

GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
RESET  = "\033[0m"


async def load_kbs() -> list[KnowledgeBase]:
    async with AsyncSessionLocal() as db:
        q = select(KnowledgeBase)
        if TARGET_KB_ID:
            from uuid import UUID
            q = q.where(KnowledgeBase.id == UUID(TARGET_KB_ID))
        result = await db.execute(q)
        return list(result.scalars().all())


async def load_items(kb_id) -> list[KnowledgeBaseItem]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(KnowledgeBaseItem).where(KnowledgeBaseItem.kb_id == kb_id)
        )
        return list(result.scalars().all())


def update_chunks(col, doc_id: str, kb_id: str, kb_name: str) -> int:
    result = col.get(where={"doc_id": {"$eq": doc_id}}, include=["metadatas"])
    ids = result["ids"]
    if not ids:
        return 0
    updated_metas = []
    for meta in result["metadatas"]:
        meta = dict(meta)
        meta["kb_id"]   = kb_id
        meta["kb_name"] = kb_name
        updated_metas.append(meta)
    col.update(ids=ids, metadatas=updated_metas)
    return len(ids)


async def main() -> None:
    print("=" * 60)
    print(f"  kb_id metadata migration {'(DRY RUN)' if DRY_RUN else ''}")
    print("=" * 60)

    from app.rag.vector_store import get_vector_store, COLLECTION_CLIENT
    store = get_vector_store()
    col   = store._collection(COLLECTION_CLIENT)

    kbs = await load_kbs()
    if not kbs:
        print(f"{YELLOW}No KBs found.{RESET}")
        return

    total_chunks = 0
    total_items  = 0

    for kb in kbs:
        kb_id_str = str(kb.id)
        kb_name   = str(kb.name)
        items     = await load_items(kb.id)
        print(f"\nKB {kb_id_str}  name={kb_name!r}  items={len(items)}")

        for item in items:
            # Resolve which doc_id to look up in ChromaDB
            if item.item_type == "doc":
                doc_id = item.doc_id
            else:
                doc_id = item.indexed_doc_id

            if not doc_id:
                print(f"  {YELLOW}· item {str(item.id)[:8]} ({item.item_type}) — no doc_id, skipped{RESET}")
                continue

            if DRY_RUN:
                result = col.get(where={"doc_id": {"$eq": doc_id}}, include=[])
                count  = len(result["ids"])
                print(f"  ~ item {str(item.id)[:8]} ({item.item_type})  doc_id={doc_id}  would update {count} chunk(s)")
                total_chunks += count
            else:
                count = update_chunks(col, doc_id, kb_id_str, kb_name)
                if count:
                    print(f"  {GREEN}✓ item {str(item.id)[:8]} ({item.item_type})  doc_id={doc_id}  updated {count} chunk(s){RESET}")
                else:
                    print(f"  {YELLOW}· item {str(item.id)[:8]} ({item.item_type})  doc_id={doc_id}  no chunks found in ChromaDB{RESET}")
                total_chunks += count
            total_items += 1

    print(f"\n{'DRY RUN — ' if DRY_RUN else ''}items processed={total_items}  chunks updated={total_chunks}\n")


if __name__ == "__main__":
    asyncio.run(main())

"""
backfill_kb_items.py — index all unindexed text/qna KB items into ChromaDB.

Finds every KnowledgeBaseItem where item_type in ('text','qna') and
indexed_doc_id is NULL, indexes it, and writes indexed_doc_id back.

Usage:
    PYTHONPATH=. venv/bin/python tests/backfill_kb_items.py

    # Dry-run (show what would be indexed, no writes):
    DRY_RUN=1 PYTHONPATH=. venv/bin/python tests/backfill_kb_items.py
"""

from __future__ import annotations

import asyncio
import os
import uuid

import app.models  # noqa: F401 — registers all SQLAlchemy mappers

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.knowledge_base import KnowledgeBaseItem
from app.models.space import Space

DRY_RUN = os.getenv("DRY_RUN", "0") == "1"

GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
RESET  = "\033[0m"


async def main() -> None:
    print("=" * 60)
    print(f"  KB text/qna backfill {'(DRY RUN)' if DRY_RUN else ''}")
    print("=" * 60)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(KnowledgeBaseItem).where(
                KnowledgeBaseItem.item_type.in_(["text", "qna"]),
                KnowledgeBaseItem.indexed_doc_id.is_(None),
            )
        )
        items = result.scalars().all()

    if not items:
        print(f"{GREEN}Nothing to backfill — all text/qna items are already indexed.{RESET}")
        return

    print(f"{YELLOW}Found {len(items)} unindexed item(s){RESET}\n")

    from app.rag.vector_store import get_vector_store
    store = get_vector_store()

    ok_count = err_count = skip_count = 0

    for item in items:
        # Resolve the space so we have the correct client_id
        async with AsyncSessionLocal() as db:
            from app.models.knowledge_base import KnowledgeBase
            kb_result = await db.execute(
                select(Space)
                .join(KnowledgeBase, Space.id == KnowledgeBase.space_id)
                .where(KnowledgeBase.id == item.kb_id)
            )
            space = kb_result.scalar_one_or_none()

        if not space:
            print(f"{RED}  ✗ item {str(item.id)[:8]} — space not found for kb_id={item.kb_id}{RESET}")
            err_count += 1
            continue

        # Build indexable text
        if item.item_type == "qna":
            text = f"Q: {item.question or ''}\nA: {item.content or ''}"
        else:
            text = item.content or ""

        if not text.strip():
            print(f"{YELLOW}  · item {str(item.id)[:8]} ({item.item_type}) — empty content, skipped{RESET}")
            skip_count += 1
            continue

        idx_doc_id = uuid.uuid4().hex[:8]
        label = f"item {str(item.id)[:8]} ({item.item_type})  space={space.display_name!r}"

        if DRY_RUN:
            print(f"  ~ {label}  would index as doc_id={idx_doc_id}")
            ok_count += 1
            continue

        try:
            store.upsert_client_chunks(
                client_id=str(space.id),
                session_id="kb",
                doc_id=idx_doc_id,
                filename=str(item.title or f"kb-{str(item.id)[:8]}"),
                extension=".txt",
                strategy="inline",
                doc_type="general",
                ttl_days=None,
                kb_name="",
                space_id=str(space.id),
                org_name=getattr(space, "display_name", ""),
                chunks=[{"text": text, "page": 1, "chunk_index": 0, "section": ""}],
            )

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == item.id)
                )
                row = result.scalar_one_or_none()
                if row:
                    row.indexed_doc_id = idx_doc_id  # type: ignore[assignment]
                    await db.commit()

            print(f"{GREEN}  ✓ {label}  doc_id={idx_doc_id}{RESET}")
            ok_count += 1

        except Exception as e:
            print(f"{RED}  ✗ {label}  error={e}{RESET}")
            err_count += 1

    print(f"\n{'DRY RUN — ' if DRY_RUN else ''}indexed={ok_count}  skipped={skip_count}  errors={err_count}")


if __name__ == "__main__":
    asyncio.run(main())

# List KBs with their org (space_id)

import asyncio
from app.core.database import AsyncSessionLocal
from app.models import Space, KnowledgeBase, KnowledgeBaseItem
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        kbs = (await db.execute(select(KnowledgeBase))).scalars().all()
        for kb in kbs:
            items = (await db.execute(
                select(KnowledgeBaseItem).where(KnowledgeBaseItem.kb_id == kb.id)
            )).scalars().all()
            space = (await db.execute(select(Space).where(Space.id == kb.space_id))).scalar_one_or_none()
            org_name = space.display_name if space else "?"
            def _status(i):
                if i.item_type == "doc":
                    return f"doc({'✓' if i.doc_id else '✗ no doc_id'})"
                return f"{i.item_type}({'✓' if i.indexed_doc_id else '✗ not indexed'})"
            types = [_status(i) for i in items]
            print(f"KB {kb.id}  org={kb.space_id}  org_name={org_name!r}  kb={kb.name!r}  items={types or '[]'}")

asyncio.run(main())

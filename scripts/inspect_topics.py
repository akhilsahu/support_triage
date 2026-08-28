"""
Read-only view of the topic/facts datastore.

    PYTHONPATH=. .venv/bin/python scripts/inspect_topics.py

Until the KB screen exposes these (see plans/), topics live only in Postgres and
in ChromaDB chunk metadata, and there is no way to see whether the two agree.
Disagreement is the failure worth catching: an item can carry a topic in
Postgres while its chunks were indexed before the topic was set, so retrieval
filters on `topic` find nothing and the symptom looks like a missing document.

Writes nothing.
"""

import asyncio
from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.kb_fact import KBFact
from app.models.knowledge_base import KnowledgeBase
from app.models.space import CustomAgent
from app.rag.vector_store import COLLECTION_CLIENT, get_vector_store


def _rule(title: str) -> None:
    print(f"\n{title}\n" + "─" * len(title))


async def main() -> None:
    store = get_vector_store()

    async with AsyncSessionLocal() as db:
        kbs = (await db.execute(
            select(KnowledgeBase).options(
                selectinload(KnowledgeBase.items),
                selectinload(KnowledgeBase.facts),
            )
        )).scalars().all()
        agents = (await db.execute(select(CustomAgent))).scalars().all()

        for kb in kbs:
            _rule(f"KB {kb.name!r}   default_topic={kb.default_topic or '—'}")

            by_topic = defaultdict(list)
            for it in kb.items:
                by_topic[it.topic or "(untagged)"].append(it)

            for topic, items in sorted(by_topic.items()):
                print(f"  topic: {topic}")
                for it in items:
                    doc_id = it.doc_id or it.indexed_doc_id or ""
                    label = it.doc_label or "—"
                    # What Chroma actually stored, which is what retrieval filters on.
                    stamped = "?"
                    if doc_id:
                        try:
                            col = store._collection(COLLECTION_CLIENT)
                            got = col.get(where={"doc_id": {"$eq": doc_id}},
                                          include=["metadatas"], limit=1)
                            m = (got.get("metadatas") or [{}])[0] or {}
                            stamped = m.get("topic") or "(none)"
                        except Exception as e:
                            stamped = f"<err {e}>"
                    # An untagged item legitimately has no topic on its chunks.
                    want = "(none)" if topic == "(untagged)" else topic
                    flag = "" if stamped in (want, "?") else "   <-- CHUNKS STALE, run retag"
                    print(f"      [{it.item_type:4}] {(it.title or '')[:42]:42} "
                          f"doc={doc_id[:8]:8} label={label[:18]:18} chunks.topic={stamped}{flag}")

            facts = kb.facts or []
            ok = sum(1 for f in facts if f.verified)
            print(f"  facts: {len(facts)} total, {ok} verified, {len(facts) - ok} awaiting confirmation")
            for f in sorted(facts, key=lambda f: (f.subject or "", f.label or "")):
                mark = "✓" if f.verified else "·"
                print(f"      {mark} [{f.topic or '—'}] {f.subject}  |  {f.render()}")

        _rule("Agents")
        for a in agents:
            scope = ", ".join(a.topics_list) or "(whole KB)"
            print(f"  {a.slug:42} topics={scope}")

        _rule("Chunk metadata in ChromaDB")
        try:
            col = store._collection(COLLECTION_CLIENT)
            got = col.get(include=["metadatas"])
            metas = got.get("metadatas") or []
            print(f"  {len(metas)} chunks")
            print("  by topic:      " + str(dict(Counter(m.get("topic") or "(none)" for m in metas))))
            print("  table rows:    " + str(sum(1 for m in metas if m.get("is_table_row"))))
            print("  whole tables:  " + str(sum(1 for m in metas
                                                if m.get("is_table") and not m.get("is_table_row"))))
            labels = [m.get("row_label") for m in metas if m.get("row_label")]
            if labels:
                print(f"  row labels:    {len(labels)} e.g. {labels[:6]}")
        except Exception as e:
            print(f"  <could not read collection: {e}>")


if __name__ == "__main__":
    asyncio.run(main())

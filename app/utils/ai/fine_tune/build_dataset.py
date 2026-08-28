"""
app/utils/ai/fine_tune/build_dataset.py

Dataset Exporter for LLM Fine-Tuning & Evaluation.

Exports cured Knowledge Base items into JSONL format for OpenAI / OpenRouter
fine-tuning jobs (gpt-4o-mini / SFT models) or accuracy benchmarks.

Usage:
    python -m app.utils.ai.fine_tune.build_dataset --out dataset.jsonl
"""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import List

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.knowledge_base import KnowledgeBaseItem
from app.rag.vector_store import get_vector_store

SYSTEM_PROMPT = (
    "You are an expert document analyzer for an enterprise Knowledge Base. "
    "Analyze document text and output scope-accurate JSON metadata."
)


async def export_dataset(output_path: str = "dataset.jsonl") -> int:
    store = get_vector_store()
    count = 0

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(KnowledgeBaseItem))
        items: List[KnowledgeBaseItem] = res.scalars().all()

        with open(output_path, "w", encoding="utf-8") as f:
            for item in items:
                snippet = item.content or ""
                if not snippet and item.doc_id:
                    chunks = store.get_doc_chunks(str(item.kb.space_id if item.kb else ""), item.doc_id)
                    if chunks:
                        snippet = "\n\n".join(c.get("text", "") for c in chunks[:40])[:30000]

                if not snippet:
                    continue

                user_content = (
                    f"Filename/Title: {item.title or ''}\n"
                    f"Content Excerpt:\n{snippet[:10000]}"
                )

                tags_list = [t.strip() for t in (item.doc_label or "").split(",") if t.strip()]

                assistant_content = json.dumps({
                    "doc_type": "Terms & Conditions" if "mitc" in (item.title or "").lower() else "Document",
                    "scope": "Portfolio-wide",
                    "description": item.description or f"Official document regarding {item.title or 'KB item'}.",
                    "topic": item.topic or item.title or "General",
                    "tags": tags_list or [item.topic] if item.topic else ["General"],
                }, ensure_ascii=False)

                record = {
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                        {"role": "assistant", "content": assistant_content},
                    ]
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                count += 1

    print(f"Successfully exported {count} training samples to {output_path}")
    return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export KB items to JSONL for fine-tuning")
    parser.add_argument("--out", default="dataset.jsonl", help="Output JSONL filename")
    args = parser.parse_args()
    asyncio.run(export_dataset(args.out))

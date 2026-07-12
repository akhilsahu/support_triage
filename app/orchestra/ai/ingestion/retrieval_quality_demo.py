"""
Retrieval-quality demo — exercises the real ingest -> chunk -> embed -> vector
store -> query_client path (the same one app/api/v1/documents.py uses for
uploaded documents), against the two real PDFs already verified for chunking
correctness. Purpose: check whether the fixed section metadata / chunk
boundaries actually translate into better retrieval, not just cleaner chunks.

Usage:
    python -m app.orchestra.ai.ingestion.retrieval_quality_demo
"""

from __future__ import annotations

import uuid

from app.orchestra.ai.ingestion import get_ingestion_service
from app.rag.document_parser import chunk_document
from app.rag.vector_store import VectorStore

# Uses its own throwaway ChromaDB directory (/tmp) rather than the project's
# real .chroma_db — this is a one-off retrieval-quality check, not data meant
# to persist in the app's actual store. The project's real .chroma_db also
# sits on a mount that doesn't support sqlite's locking, causing "disk I/O
# error" — a local /tmp path sidesteps that too.
DEMO_PERSIST_DIR = "/tmp/chroma_retrieval_demo"

CLIENT_ID = "demo-retrieval-test"

DOCS = [
    {
        "path": "downloads/hdfc-life-click-2-protect-supreme-plus.pdf",
        "questions": [
            ("What is the free look period?", "Free look Period"),
            ("What is the grace period for premium payment?", None),  # not a section in this doc
            ("What is the Parent Secure Option?", "11) Parent Secure Option"),
            ("What happens under the Renewability Option at Maturity?", "9) Renewability Option at Maturity"),
            ("What are the exclusions for the Waiver of Premium on Total and Permanent Disability option?",
             "d. Exclusions for WOP Disability Options"),
        ],
    },
    {
        "path": "downloads/SBI_Life_-_Smart_Swadhan_Supreme__brochure__eng.pdf",
        "questions": [
            ("Who can avail this plan?", "Who can avail this plan?"),
            ("What is the grace period for paying premiums?", "Grace Period"),
            ("What is the free look period?", "Free look Period"),
            ("How does the surrender benefit work?", "Surrender Benefit"),
            ("What is the staff discount?", "Staff Discount"),
        ],
    },
]


def main() -> None:
    svc = get_ingestion_service()
    store = VectorStore(persist_dir=DEMO_PERSIST_DIR)

    doc_ids = {}
    for entry in DOCS:
        path = entry["path"]
        filename = path.split("/")[-1]
        raw = open(path, "rb").read()
        parsed = svc.parse(raw, filename)
        chunks = chunk_document(parsed)

        doc_id = uuid.uuid5(uuid.NAMESPACE_URL, filename).hex[:8]  # stable across reruns
        doc_ids[filename] = doc_id

        store.upsert_client_chunks(
            client_id=CLIENT_ID,
            session_id="demo-session",
            doc_id=doc_id,
            filename=filename,
            extension=parsed.extension,
            strategy="by_structure",
            chunks=[
                {"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section}
                for c in chunks
            ],
        )
        print(f"Indexed {filename}: {len(chunks)} chunks -> doc_id={doc_id}")

    print(f"\n{'='*90}")

    for entry in DOCS:
        filename = entry["path"].split("/")[-1]
        doc_id = doc_ids[filename]
        print(f"\n### {filename} (doc_id={doc_id})")
        for question, expected_section in entry["questions"]:
            hits = store.query_client(
                client_id=CLIENT_ID,
                query_text=question,
                doc_id=doc_id,
                top_k=3,
                min_score=0.0,
            )
            print(f"\n  Q: {question}")
            if expected_section:
                print(f"     expected section: {expected_section!r}")
            for i, h in enumerate(hits):
                meta = h["metadata"]
                excerpt = h["document"].strip().replace("\n", " ")[:100]
                hit_flag = ""
                if expected_section and meta.get("section") == expected_section:
                    hit_flag = "  <-- MATCH"
                print(f"     #{i} score={h['score']:.3f} page={meta.get('page')} "
                      f"section={meta.get('section')!r}{hit_flag}")
                print(f"         {excerpt}...")


if __name__ == "__main__":
    main()

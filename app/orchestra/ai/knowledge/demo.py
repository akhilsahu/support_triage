"""
Retrieval demo — exercises the REAL agent retrieval path end to end:

    ingest -> chunk -> embed(write) -> ChromaDB
                                          |
    query -> embed(read) -> hybrid search -> rerank -> Documents

This is the path the chat agents actually use (AgnoChromaKnowledgeBackend ->
Knowledge.search), so it validates the Phase-1 wiring that the older
ingestion/retrieval_quality_demo.py (direct VectorStore.query) never touches:

    * shared embedding config — write EF and read embedder must match (same
      model + dimensions) or query vectors won't line up with stored vectors
    * hybrid search actually engaging on the collection VectorStore wrote
    * the pluggable reranker slot (cohere | sentence_transformer | none)

Standalone. Writes to a throwaway /tmp ChromaDB, not the project's real store.

Config is via the FUNCTIONAL PARAMETERS at the top of main() — edit those and
run. No command-line arguments.

    python -m app.orchestra.ai.knowledge.demo
"""

from __future__ import annotations

import os
import time
import uuid
from pathlib import Path


def main() -> None:
    # ── Functional parameters (edit these; no CLI args) ───────────────────────
    files = [
        "/Users/aks/Downloads/hdfc-life-click-2-protect-supreme-plus.pdf",
        "/Users/aks/Downloads/SBI_Life_-_Smart_Swadhan_Supreme__brochure__eng.pdf",
    ]
    # (question, expected_section_or_None) per file, keyed by filename.
    questions = {
        "hdfc-life-click-2-protect-supreme-plus.pdf": [
            ("What is the free look period?", "Free look Period"),
            ("What is the Parent Secure Option?", "11) Parent Secure Option"),
            ("What happens under the Renewability Option at Maturity?", "9) Renewability Option at Maturity"),
        ],
        "SBI_Life_-_Smart_Swadhan_Supreme__brochure__eng.pdf": [
            ("Who can avail this plan?", "Who can avail this plan?"),
            ("What is the grace period for paying premiums?", "Grace Period"),
            ("How does the surrender benefit work?", "Surrender Benefit"),
        ],
    }

    rerank          = False              # True → turn the reranker on for this run
    rerank_provider = "cohere"           # cohere | sentence_transformer | none
    top_k           = 3                  # results shown per query
    no_vision       = True               # skip GPT vision fallback during parse
    verbose         = False              # print full chunk text of each hit

    persist_dir = "/tmp/chroma_knowledge_demo"
    collection  = "client_documents"     # same collection name the app uses
    space_id    = "demo-knowledge-test"  # stored as client_id; isolates this run

    # ── Env / settings overrides (before importing the pipeline) ──────────────
    if no_vision:
        os.environ["INGESTION_VISION_ENABLED"] = "false"

    from app.config import settings
    settings.RERANK_ENABLED  = rerank
    settings.RERANK_PROVIDER = rerank_provider
    settings.RAG_TOP_K       = top_k

    from app.orchestra.ai.ingestion import get_ingestion_service
    from app.orchestra.ai.chunking import get_chunking_service
    from app.rag.vector_store import VectorStore
    from app.orchestra.ai.knowledge.agno_chroma import AgnoChromaKnowledgeBackend
    from app.orchestra.ai.knowledge.reranking import build_reranker

    ingestion = get_ingestion_service()
    chunker   = get_chunking_service()
    store     = VectorStore(persist_dir=persist_dir)

    print(f"\n{'='*90}")
    print(f"Retrieval demo — persist={persist_dir} collection={collection}")
    active = build_reranker()
    print(f"Reranker : {type(active).__name__ if active else 'none'} "
          f"(RERANK_ENABLED={settings.RERANK_ENABLED}, provider={settings.RERANK_PROVIDER})")
    print(f"{'='*90}")

    # ── Ingest -> chunk -> upsert (write path) ────────────────────────────────
    doc_ids = {}
    for path in files:
        fp = Path(path)
        if not fp.exists():
            print(f"SKIP (not found): {fp}")
            continue
        parsed = ingestion.parse(fp.read_bytes(), fp.name)
        chunks = chunker.chunk(parsed)
        doc_id = uuid.uuid5(uuid.NAMESPACE_URL, fp.name).hex[:8]  # stable across reruns
        doc_ids[fp.name] = doc_id
        store.upsert_client_chunks(
            client_id=space_id,
            session_id="demo-session",
            doc_id=doc_id,
            filename=fp.name,
            extension=parsed.extension,
            strategy=chunker.get_config(fp.name).strategy.value,
            chunks=[{"text": c.text, "page": c.page,
                     "chunk_index": c.chunk_index, "section": c.section} for c in chunks],
        )
        print(f"Indexed {fp.name}: {len(chunks)} chunks -> doc_id={doc_id}")

    if not doc_ids:
        print("\nFAIL: nothing indexed.")
        return

    # ── Build the SAME retrieval object the agent gets ────────────────────────
    backend = AgnoChromaKnowledgeBackend(chroma_path=persist_dir, chroma_collection=collection)
    bundle  = backend.for_agent(space_id=space_id)
    if not bundle.knowledge:
        print("\nFAIL: knowledge backend unavailable (agno import or init error).")
        return
    knowledge = bundle.knowledge
    filters   = bundle.filters

    # ── Query through hybrid search (+ rerank) ────────────────────────────────
    total = hits_matched = 0
    for fname, qs in questions.items():
        if fname not in doc_ids:
            continue
        print(f"\n### {fname}")
        for question, expected in qs:
            t0 = time.time()
            results = knowledge.search(query=question, filters=filters)[:top_k]
            elapsed = (time.time() - t0) * 1000

            print(f"\n  Q: {question}   ({elapsed:.0f} ms)")
            if expected:
                print(f"     expected section: {expected!r}")
            total += 1
            matched_here = False
            for i, doc in enumerate(results):
                meta    = doc.meta_data or {}
                section = meta.get("section", "")
                rr      = getattr(doc, "reranking_score", None)
                rr_str  = f" rerank={rr:.3f}" if rr is not None else ""
                flag    = ""
                if expected and section == expected:
                    flag = "  <-- MATCH"
                    matched_here = True
                excerpt = (doc.content or "").strip().replace("\n", " ")[:100]
                print(f"     #{i} page={meta.get('page')} section={section!r}{rr_str}{flag}")
                print(f"         {excerpt}...")
                if verbose:
                    print(f"\n{doc.content}\n{'-'*40}")
            if matched_here:
                hits_matched += 1

    print(f"\n{'='*90}")
    print(f"Section-match rate: {hits_matched}/{total} queries hit their expected section")
    print(f"(informational — a miss can still be a good answer if the info lives elsewhere)")
    print(f"{'='*90}\n")


if __name__ == "__main__":
    main()

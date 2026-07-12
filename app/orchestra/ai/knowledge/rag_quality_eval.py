"""
rag_quality_eval — measures retrieval RECALL of specific facts through the REAL
agent retrieval path (Agno hybrid search + reranker), so Phase-1 changes
(top_k bump, Cohere rerank) can be measured instead of guessed.
See RAG_QUALITY_PLAN.md.

Each eval case is (label, query, [fact keywords the answer needs]). A case's
recall = fraction of its fact keywords found in the union of the retrieved
top-K chunk texts. The harness runs every case with rerank OFF, then ON, and
prints a side-by-side comparison so the delta is explicit.

Standalone. Throwaway /tmp Chroma; SESSION_STORE forced off (no Postgres needed).
Needs OPENAI_API_KEY (embeddings); the rerank column also needs COHERE_API_KEY.

    python -m app.orchestra.ai.knowledge.rag_quality_eval
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path


def main() -> None:
    # ── Functional parameters (edit these; no CLI args) ───────────────────────
    files = ["/Users/aks/Downloads/hdfc-life-click-2-protect-supreme-plus.pdf"]

    # (label, query, [lowercase fact keywords the correct answer must contain]).
    # Keywords are matched as substrings across the retrieved chunk texts.
    cases = [
        ("termination (R3)",
         "How can I exit, surrender, or terminate this policy early?",
         ["free look", "surrender", "smart exit", "return of premium"]),
        ("eligibility/technical (R4)",
         "What are the eligibility criteria: minimum and maximum entry age, "
         "maturity age, and minimum sum assured?",
         ["entry age", "sum assured", "maturity"]),
        ("free look (regression)",
         "What is the free look period?",
         ["free look", "30 days"]),
        ("parent secure (regression)",
         "What is the Parent Secure Option?",
         ["parent secure"]),
        ("features (baseline)",
         "What are the key features of the policy?",
         ["death benefit"]),
    ]

    top_k          = 8               # matches RERANK_TOP_N / RAG_TOP_K
    compare_rerank = True            # run rerank OFF then ON for a before/after
    no_vision      = True

    persist_dir = "/tmp/chroma_rag_eval"
    collection  = "client_documents"
    space_id    = "rag-eval-test"

    # ── Env (before importing the pipeline) ───────────────────────────────────
    if no_vision:
        os.environ["INGESTION_VISION_ENABLED"] = "false"
    os.environ["CHROMA_PERSIST_DIR"] = persist_dir
    os.environ["SESSION_STORE"]      = "none"        # no Postgres needed for eval

    from app.config import settings
    if not settings.OPENAI_API_KEY:
        print("FAIL: OPENAI_API_KEY not set — embeddings unavailable.")
        return
    settings.RAG_TOP_K = top_k

    from app.orchestra.ai.ingestion import get_ingestion_service
    from app.orchestra.ai.chunking import get_chunking_service
    from app.rag.vector_store import VectorStore
    from app.orchestra.ai.knowledge.agno_chroma import AgnoChromaKnowledgeBackend

    # ── Ingest -> chunk -> upsert (write path) ────────────────────────────────
    ingestion = get_ingestion_service()
    chunker   = get_chunking_service()
    store     = VectorStore(persist_dir=persist_dir)

    for path in files:
        fp = Path(path)
        if not fp.exists():
            print(f"SKIP (not found): {fp}")
            continue
        parsed = ingestion.parse(fp.read_bytes(), fp.name)
        chunks = chunker.chunk(parsed)
        store.upsert_client_chunks(
            client_id=space_id, session_id="rag-eval", doc_id=uuid.uuid5(uuid.NAMESPACE_URL, fp.name).hex[:8],
            filename=fp.name, extension=parsed.extension,
            strategy=chunker.get_config(fp.name).strategy.value,
            chunks=[{"text": c.text, "page": c.page, "chunk_index": c.chunk_index, "section": c.section} for c in chunks],
        )
        print(f"Indexed {fp.name}: {len(chunks)} chunks")

    # ── Run the eval under each rerank setting ────────────────────────────────
    modes = [False, True] if compare_rerank else [settings.RERANK_ENABLED]
    results: dict = {}  # mode -> {label -> (found, total)}

    for rerank_on in modes:
        settings.RERANK_ENABLED = rerank_on
        # Fresh backend so it rebuilds Knowledge with/without the reranker.
        backend = AgnoChromaKnowledgeBackend(chroma_path=persist_dir, chroma_collection=collection)
        bundle  = backend.for_agent(space_id=space_id)
        if not bundle.knowledge:
            print(f"\nFAIL: knowledge backend unavailable (rerank={rerank_on}).")
            return

        label = "rerank_ON" if rerank_on else "rerank_OFF"
        if rerank_on and not settings.COHERE_API_KEY:
            print(f"\n(note) COHERE_API_KEY empty — {label} degrades to no-rerank.")

        results[label] = {}
        for name, query, facts in cases:
            docs = bundle.knowledge.search(query=query, filters=bundle.filters)[:top_k]
            blob = " ".join((d.content or "") for d in docs).lower()
            found = [kw for kw in facts if kw in blob]
            results[label][name] = (len(found), len(facts), [kw for kw in facts if kw not in blob])

    # ── Report ────────────────────────────────────────────────────────────────
    print(f"\n{'='*94}")
    print(f"Fact-recall through the Agno retrieval path (top_k={top_k})")
    print(f"{'='*94}")
    header = f"{'case':<28}" + "".join(f"{m:>14}" for m in results)
    print(header)
    print("-" * len(header))
    totals = {m: [0, 0] for m in results}
    for name, _q, facts in cases:
        row = f"{name:<28}"
        for m in results:
            f_, t_, _missing = results[m][name]
            totals[m][0] += f_; totals[m][1] += t_
            row += f"{f'{f_}/{t_}':>14}"
        print(row)
    print("-" * len(header))
    trow = f"{'TOTAL recall':<28}"
    for m in results:
        f_, t_ = totals[m]
        trow += f"{f'{f_}/{t_} ({100*f_//max(t_,1)}%)':>14}"
    print(trow)

    # Show what each mode still missed (the actionable part).
    for m in results:
        misses = {n: miss for n, (_f, _t, miss) in results[m].items() if miss}
        if misses:
            print(f"\n{m} missed:")
            for n, miss in misses.items():
                print(f"  {n}: {miss}")
    print(f"\n{'='*94}\n")


if __name__ == "__main__":
    main()

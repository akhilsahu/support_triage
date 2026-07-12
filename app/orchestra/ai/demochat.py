"""
demochat — end-to-end CHATBOT demo through the REAL production orchestrator.

Instead of hand-building an Agno agent, this drives the actual runtime path:

    ingest -> chunk -> embed -> ChromaDB
                                   |
    turn -> AgnoOrchestrator -> SessionPool -> TeamFactory/AgentFactory
                             -> Agno runner (knowledge + history + memory) -> reply

So it exercises everything we wired: the shared embedding config, hybrid search
+ pluggable reranker, reliable RAG grounding (add_knowledge_to_context), and the
Agno-native session store (history / user-memory / summaries) — exactly as a
live chat request would, just with throwaway /tmp stores.

Multi-turn, with follow-ups that only work if history is threaded: a pronoun
turn ("how many days is that?") and a pure-recall turn ("which did I ask first?").

Standalone. Throwaway /tmp ChromaDB + /tmp SQLite session db (no Postgres needed).
Calls a real LLM, so it needs OPENAI_API_KEY and spends tokens.

Config is via the FUNCTIONAL PARAMETERS at the top of main(). No CLI args.

    python -m app.orchestra.ai.demochat
"""

from __future__ import annotations

import asyncio
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
    # A CONVERSATION, not independent questions. Later turns lean on earlier ones.
    turns = [
        "What is the free look period for the HDFC Click 2 Protect plan?",
        "And exactly how many days is that?",                 # 'that' → needs history
        "Who is eligible to buy the SBI Smart Swadhan Supreme plan?",
        "Between those two plans, which one did I ask about first?",  # pure recall
    ]

    rerank          = False              # cohere | sentence_transformer via provider
    rerank_provider = "cohere"
    no_vision       = True

    persist_dir = "/tmp/chroma_demochat"
    session_db  = "/tmp/demochat_sessions.db"
    space_id    = "demochat-test"        # == client_id used at ingest AND knowledge filter
    session_id  = "demochat-session-1"   # stable across turns → one conversation
    org_name    = "Demo Insurance"

    # ── Env overrides BEFORE importing the pipeline (config reads these) ───────
    # Point the orchestrator's own config at the demo's throwaway stores.
    if no_vision:
        os.environ["INGESTION_VISION_ENABLED"] = "false"
    os.environ["CHROMA_PERSIST_DIR"]   = persist_dir          # knowledge backend path
    os.environ["SESSION_STORE"]        = "sqlite"             # no Postgres for the demo
    os.environ["AGNO_SESSION_DB_URL"]  = session_db
    os.environ["RERANK_ENABLED"]       = "true" if rerank else "false"
    os.environ["RERANK_PROVIDER"]      = rerank_provider

    from app.config import settings
    if not settings.OPENAI_API_KEY:
        print("FAIL: OPENAI_API_KEY not set — the chat step needs a live model.")
        return

    from app.orchestra.ai.ingestion import get_ingestion_service
    from app.orchestra.ai.chunking import get_chunking_service
    from app.rag.vector_store import VectorStore
    from app.agents.resolved_agent import ResolvedAgent
    from app.orchestra.ai.orchestrators.agno import AgnoOrchestrator

    # ── Ingest -> chunk -> upsert (write path) into the demo store ────────────
    ingestion = get_ingestion_service()
    chunker   = get_chunking_service()
    store     = VectorStore(persist_dir=persist_dir)

    print(f"\n{'='*90}")
    print(f"demochat — {len(turns)}-turn conversation via AgnoOrchestrator   rerank={rerank}")
    print(f"{'='*90}")

    indexed = 0
    for path in files:
        fp = Path(path)
        if not fp.exists():
            print(f"SKIP (not found): {fp}")
            continue
        parsed = ingestion.parse(fp.read_bytes(), fp.name)
        chunks = chunker.chunk(parsed)
        doc_id = uuid.uuid5(uuid.NAMESPACE_URL, fp.name).hex[:8]
        store.upsert_client_chunks(
            client_id=space_id,              # MUST equal orchestrator space_id
            session_id="demochat-ingest",
            doc_id=doc_id,
            filename=fp.name,
            extension=parsed.extension,
            strategy=chunker.get_config(fp.name).strategy.value,
            chunks=[{"text": c.text, "page": c.page,
                     "chunk_index": c.chunk_index, "section": c.section} for c in chunks],
        )
        indexed += 1
        print(f"Indexed {fp.name}: {len(chunks)} chunks")

    if not indexed:
        print("\nFAIL: nothing indexed.")
        return

    # ── One support specialist (single specialist → bare Agent w/ session) ────
    agent = ResolvedAgent(
        slug="support",
        name="Insurance Support",
        description="Answers insurance product questions from the knowledge base.",
        agent_type="custom",
        is_builtin=False,
        system_prompt=(
            "You are a customer-support assistant for insurance products. "
            "Answer strictly from the retrieved knowledge base and cite the section. "
            "Use the conversation to resolve references like 'that' or 'those'. "
            "If a fact isn't in the knowledge base, say you don't have it."
        ),
        base_prompt="",
        temperature=0.2,
        max_tokens=600,
        rag_enabled=True,
        rag_doc_types_list=[],
        rag_top_k=5,
        keywords_list=[],
    )

    # ── Drive the REAL orchestrator, one conversation across all turns ────────
    orch = AgnoOrchestrator(
        space_id=space_id,
        org_name=org_name,
        active_agents=[agent],
        session_id=session_id,
    )

    async def _converse() -> None:
        await orch.warmup()
        for i, turn in enumerate(turns, 1):
            print(f"\n{'─'*90}\nTurn {i}  ▶  {turn}")
            t0 = time.time()
            result = await orch.run(turn)     # session_id + user_id threaded inside
            dt = time.time() - t0
            reply = (result.get("reply") or "").strip()
            cites = result.get("citations") or []
            print(f"  🤖 ({dt:.1f}s) [rag_hit={result.get('rag_hit')}, "
                  f"citations={len(cites)}]: {reply}")
            for c in cites[:3]:
                print(f"       ↳ {c.get('filename')} p{c.get('page')} [{c.get('section')}]")

    asyncio.run(_converse())

    print(f"\n{'='*90}")
    print("History check: turns 2 & 4 are correct only if the orchestrator threaded history.")
    print(f"{'='*90}\n")


if __name__ == "__main__":
    main()

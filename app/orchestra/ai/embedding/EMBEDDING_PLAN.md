# Embedding & Retrieval Implementation Plan

> **Status:** Planning — do not implement until items are picked from here.
> Follows the same "plan → approve → implement" flow as CHUNKING_PLAN.md.
> New code lives under `app/orchestra/ai/` (same move as ingestion + chunking).

---

## 0. Current State (verified in code, not assumed)

### Three embedder definitions, no shared source of truth
| Location | Model | Role today |
|---|---|---|
| `app/rag/embedder.py` (`Embedder`) | `text-embedding-3-small` | **DEAD — zero importers** |
| `app/rag/vector_store.py` (`OpenAIEmbeddingFunction`) | hard-coded `text-embedding-3-small` | live **write** path |
| `app/orchestra/ai/knowledge/agno_chroma.py` (`OpenAIEmbedder`) | `text-embedding-3-small` | live **read** path (hybrid) |

`app/config.py` already declares `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`,
`EMBEDDING_BATCH_SIZE` — but neither the write nor read path reads them. The model
is hard-coded in two places instead.

### Two live retrieval paths
| Path | Callers | Retrieval quality |
|---|---|---|
| **Agno Knowledge** (`agno_chroma`, default backend) | `app/orchestra/ai/*` agents | hybrid search, reranker slot available |
| **Direct `VectorStore.query()`** | `app/agents/{support,tech_support,finance}_agent.py`, `rag_service.py`, `dynamic_executor.py`, `chat_suggestions.py`, `poc.py` | plain cosine, no hybrid, no rerank |

### Reranker: declared, never wired
`app/config.py` has `RERANK_ENABLED / RERANK_PROVIDER / RERANK_MODEL / RERANK_TOP_N`.
Nothing reads them. Agno ships `CohereReranker` (+ sentence_transformer, bedrock,
infinity) and `agno.vectordb.chroma.ChromaDb` accepts `reranker=` and applies it
inside `search()`.

### Context-enriched prefix is inside the embedded vector
The chunker now bakes `filename > section:` into `Chunk.text`. ChromaDB embeds the
stored `document` string, so that prefix is now part of every chunk's embedding:
- constant filename tokens across all of a doc's chunks → bias that pulls them
  together and blunts chunk-to-chunk discrimination
- queries carry no prefix → systematic query/chunk asymmetry
- `filename` + `section` are **already in metadata**, so the prefix is redundant
  for anything except embedding-time signal — which we've shown is net-negative.

---

## 1. Retrieval-Layer Decision — Agno Chroma vs alternatives

### Is Agno Chroma usable? — Yes.
Hybrid search works, the reranker slot is real, it's already the default backend,
and it already sits behind `BaseKnowledgeBackend` so the vector DB is swappable.
**Keep it as the standard retrieval abstraction.**

### Should Chroma stay the vector DB? — Yes for now, with an eye on pgvector.
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Chroma (current)** | embedded, zero infra, already wired, Agno hybrid works | basic hybrid, separate datastore from app Postgres | **Keep for Phase 1** |
| **pgvector (via Agno `PgVector`)** | collapses into the Postgres you already run, transactional with app data, one backup story, Agno hybrid support | migration + reindex, ops on Postgres | **Phase 3 candidate** — strongest long-term fit since Postgres already exists |
| **Qdrant** | best-in-class native sparse+dense hybrid, strong filtering, scales | new service to run | overkill at current scale |
| **Weaviate / Milvus** | scale | heavy infra | no |

**Decision:** standardize all retrieval on the Agno `BaseKnowledgeBackend`
abstraction, keep Chroma as the concrete DB, and keep the backend interface clean
so a `pgvector` backend can be dropped in later without touching agents.

### The two-path problem
The legacy `app/agents/*` direct `VectorStore.query()` path won't get hybrid or
rerank until it moves onto the same retrieval service. Full migration is a bigger
lift → **scoped into Phase 3**, not Phase 1.

---

## 2. Embed-text vs Display-text — the core fix

**Problem:** one string is used for both embedding and what the LLM reads. The
context prefix helps the reader but hurts the vector.

**Decision (Phase 1): stop baking the constant prefix into the embedded text.**
- `Chunk.text` = **raw** chunk text (what gets embedded and returned)
- Context (`filename`, `section`, `page`) is **already in metadata** — reconstruct
  the human/LLM-facing context at prompt-assembly time, not at embed time
- Net effect: removes the query/chunk asymmetry and the constant-bias vector for
  free, and deletes the `_apply_context_enriched` prefixing from the embed path

Concretely: set `ChunkConfig.context_enriched = False` as the default and remove
the prefix injection from `chunker.py`'s embed output. Keep the
`context_enriched.py` strategy file but repurpose it as a **prompt-time** helper
(build `"filename > section:\n{text}"` from metadata when assembling context),
not an embed-time mutation.

**Phase 2 upgrade (optional, higher accuracy): Contextual Retrieval**
Anthropic-style — generate a short *chunk-specific* context sentence per chunk
with a cheap LLM and prepend **that** before embedding (not a constant filename).
This is the "good" version of context enrichment; costs one LLM call per chunk at
ingest. Plan it as a follow-up, off by default.

---

## 3. Unified Embedding Module (`app/orchestra/ai/embedding/`)

Replace dead `app/rag/embedder.py` with one config-driven service that **both**
the write and read paths use, so model/dimension can never drift.

```
app/orchestra/ai/embedding/
    __init__.py            # exports get_embedder_config, build_openai_embedder
    config.py              # reads settings.EMBEDDING_MODEL / _DIMENSION / _BATCH_SIZE
    service.py             # thin factory: returns an Agno OpenAIEmbedder + a
                           #   chromadb OpenAIEmbeddingFunction from the SAME config
```

- One place decides model + dimensions.
- `vector_store.py::_get_chroma_ef()` calls into it instead of hard-coding.
- `agno_chroma.py` calls into it instead of constructing `OpenAIEmbedder` inline.
- Adds `dimensions=settings.EMBEDDING_DIMENSION` so switching to
  `text-embedding-3-large` (or shortened dims) is a one-line config change.
- Retry/backoff (tenacity) lives here so every embed call inherits it.

**No custom async `embed()`** — the footgun
(`asyncio.get_event_loop().run_until_complete()`) is not recreated. Embedding is
delegated to Agno's embedder (read) and Chroma's EF (write); the module only
builds and configures them from shared settings.

---

## 4. Wire the Reranker (config already exists)

In `agno_chroma.py`, when `settings.RERANK_ENABLED`:
```
from agno.knowledge.reranker.cohere import CohereReranker
reranker = CohereReranker(
    model=settings.RERANK_MODEL,
    api_key=settings.COHERE_API_KEY,   # add to config
    top_n=settings.RERANK_TOP_N,
)
ChromaDb(..., reranker=reranker)
```
- Over-fetch before rerank: raise the knowledge retrieval `n` (e.g. 20) so the
  reranker has candidates to reorder down to `RERANK_TOP_N` (5).
- Provider `none` / `RERANK_ENABLED=False` → no reranker, current behavior.
- `sentence_transformer` reranker is the local/no-API fallback option if Cohere
  key isn't desired.

Single highest-ROI accuracy lever; touches one file + config.

---

## 5. Delete the dead Embedder

- Delete `app/rag/embedder.py`.
- Remove its re-exports from `app/rag/__init__.py`
  (`Embedder`, `get_embedder` on lines 4 / 8-9).
- Confirmed zero importers, so no other call sites change.

---

## 6. Implementation Order — PHASE 1 DONE

| # | Item | Files | Status |
|---|---|---|---|
| 1 | `COHERE_API_KEY` in config (+ `RERANK_FETCH_K`) | `app/config.py` | ✅ done (already present) |
| 2 | Create `app/orchestra/ai/embedding/` (config + service + factories) | new dir | ✅ done |
| 3 | Point `vector_store._get_chroma_ef()` at shared config | `vector_store.py` | ✅ done |
| 4 | Point `agno_chroma.py` embedder at shared config | `agno_chroma.py` | ✅ done |
| 5 | Wire `CohereReranker` behind `RERANK_ENABLED` | `agno_chroma.py` | ✅ done (`_build_reranker`) |
| 6 | Over-fetch before rerank (`Knowledge(max_results=RERANK_FETCH_K)`) | `agno_chroma.py` | ✅ done |
| 7 | Stop baking context prefix into embedded text (`context_enriched=False`) | `chunking/config.py`, `chunker.py` | ✅ done |
| 8 | Repurpose `context_enriched.py` → `enrich_for_prompt()` (prompt-time, non-mutating) | `context_enriched.py` | ✅ done |
| 9 | Delete `app/rag/embedder.py` + exports | 2 files | ✅ done |
| 10 | Retrieval-quality check before/after | demo | ⏳ pending real run |

**Verified:** read+write embedders build from one config (model/dims cannot drift);
Chroma EF + Agno embedder both `text-embedding-3-small`/1536; reranker off by
default and degrades gracefully when `cohere` absent; chunks embed RAW text (no
filename prefix); `enrich_for_prompt()` reattaches context for display; all touched
files compile and both API routers import.

**Dependency note:** reranking needs `pip install cohere` + `COHERE_API_KEY` to
actually engage (open question #2). Off by default, so no hard dependency added.
`sentence_transformer` reranker is the local no-API alternative if preferred.

**Phase 2 (separate):**
- Contextual Retrieval (per-chunk LLM context before embedding).
- Upgrade to `text-embedding-3-large` if the quality demo shows recall gaps.

**Phase 3 (separate, bigger):**
- Migrate legacy `app/agents/*` + `rag_service` direct `VectorStore.query()` onto
  the Agno knowledge/retrieval path (or add rerank to `VectorStore.query`).
- Evaluate `pgvector` backend behind `BaseKnowledgeBackend` to collapse into the
  existing Postgres.

---

## 7. Open Questions

1. **Re-embedding on model change**: switching model/dimensions invalidates every
   stored vector. Need a reindex path (re-embed all chunks) — Phase 2 when/if we
   move to `3-large`. Chroma collection must be recreated at the new dimension.
2. **Cohere dependency**: pull in `cohere` package + key, or default to the local
   `sentence_transformer` reranker to avoid an external API? (Recommend Cohere for
   quality, ST as documented fallback.)
3. **Prompt-time context injection on the Agno path**: Agno controls context
   assembly internally — confirm whether metadata (`filename`, `section`) can be
   surfaced into the agent context, or whether we prepend it to the returned
   document content at retrieval time.
4. **Over-fetch size**: `n=20 → top_n=5` is a starting point; tune against the
   retrieval-quality demo.

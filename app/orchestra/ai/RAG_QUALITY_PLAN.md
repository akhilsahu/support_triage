# RAG Answer-Quality Improvement Plan

> **Status:** Planning — review before implementing.
> Driver: a 7.5/10 eval of the HDFC bot. Answers are safe/well-formatted but
> surface-level: they miss scattered policy exclusions and repeat feature lists
> instead of citing eligibility tables. Every symptom maps to a stage in the
> existing pipeline (retrieval recall / table retrievability / prompting).

---

## 0. Symptom → Root Cause

| Eval symptom | Stage at fault | Why |
|---|---|---|
| R3: missed ROP exclusion + Free-Look window when explaining termination | **Retrieval recall** | "How to terminate" spans 3–4 sections (Smart Exit, ROP exclusion, Free-Look, Surrender). With `top_k=5` and rerank OFF, only the top Smart Exit chunk lands in context; the rest fall below the cut. |
| R4: "technical details" repeated the feature list, ignored eligibility tables | **Table retrievability + query intent** | Eligibility tables are atomic chunks whose vectors are dominated by numbers/labels; a vague query ("technical details") doesn't match them, so the earlier feature chunks win again. |
| Repetition across turns | **Prompting + history** | The agent sees its prior "features" answer in history and reuses it when retrieval gives nothing better for the vague query. |

---

## 1. Retrieval recall (fixes R3) — config + reranker

### The subtlety (must get both knobs)
`agno_chroma._get_knowledge()`:
```
max_results = RERANK_FETCH_K if reranker else RAG_TOP_K
```
- rerank OFF → LLM gets `RAG_TOP_K` (5).
- rerank ON  → fetches `RERANK_FETCH_K` (20), but the reranker trims to `RERANK_TOP_N` (5) → LLM still gets 5.

So widening context means raising **both** `RAG_TOP_K` and `RERANK_TOP_N`.

### Changes (`app/config.py`)
| Setting | Now | Proposed |
|---|---|---|
| `RAG_TOP_K` | 5 | **8** (no-rerank path) |
| `RERANK_TOP_N` | 5 | **8** (final chunks after rerank) |
| `RERANK_FETCH_K` | 20 | 24 (over-fetch pool) |
| `RERANK_ENABLED` | false | **true** (in `.env`) |

### Dependency
Reranker is built + pluggable but **inert** — no provider installed. Pick one:
- `pip install cohere` + `COHERE_API_KEY` (hosted, best; `cohere` already active in requirements), or
- `pip install sentence-transformers` + `RERANK_PROVIDER=sentence_transformer` (local, no key, +PyTorch).

**Effect:** over-fetch 24 → rerank → keep best 8. Surfaces the ROP-exclusion clause and Free-Look section that pure top-5 vector search buries. *Config-only, highest leverage.*

---

## 2. Prompting (fixes exclusions + repetition) — free

Add a platform-level directive block in
`AgentFactory._build_system_prompt` (`factories/agent.py:160`), appended after
`base_prompt`/`system_prompt` so every agent inherits it:

```
RAG_QUALITY_DIRECTIVES = (
  "When listing exclusions, conditions, or eligibility, enumerate EVERY item "
  "that applies — never stop at the first. For termination questions, cover all "
  "avenues (free-look period, surrender, smart exit, maturity) and every "
  "option-specific exclusion (e.g. Life Goal AND Return of Premium).\n"
  "For 'technical'/'specification' questions, prefer exact figures from "
  "eligibility/benefit tables (entry/maturity age, sum assured, limits) over "
  "repeating feature lists.\n"
  "Do NOT repeat information already given earlier in the conversation — answer "
  "the new angle."
)
```
Injected once (not per skill). *Prompt edit only.*

---

## 3. Table retrievability (fixes R4) — caption tables at ingest

Eligibility tables exist but are semantically invisible to conceptual queries.
This is the **contextual-retrieval** idea deferred in `EMBEDDING_PLAN.md`, scoped
to tables only.

### Phase 3a — heuristic caption (cheap, no LLM)
When emitting a table chunk (`chunking/strategies/by_structure.py` table branch,
and the table paths in DocxParser/XlsxParser/HtmlParser), prepend a
natural-language caption built from the section heading + header row, e.g.:

```
"Eligibility criteria table — columns: Entry Age, Maturity Age, Sum Assured. <rows>"
```

so "eligibility / age limits / sum assured / technical details" match the table's
vector. Requires **re-ingesting** existing docs.

### Phase 3b — LLM caption (better recall, costs one call/table at ingest)
Generate a 1-sentence description of what the table contains (Anthropic-style
contextual retrieval) and prepend it. Off by default behind a config flag
(`INGESTION_TABLE_CAPTIONS=llm|heuristic|none`).

*Effect: directly fixes the missed entry-age/maturity/sum-assured metrics.*

---

## 4. Agentic multi-search (reinforces 1 & 3)

The agent already has `search_knowledge=True`. Add a directive to decompose
multi-part questions and search each sub-topic separately (one search per
termination method / per metric group), complementing `add_knowledge_to_context`
(which uses the raw message). *Prompt edit; pairs with §2.*

---

## 5. Measurement — make "7.5 → higher" measurable

Extend `ingestion/retrieval_quality_demo.py` with the exact failing cases and run
before/after each change:

| Query | Expected section(s) must be retrieved |
|---|---|
| "How do I terminate / exit the policy?" | Smart Exit, **Return of Premium exclusion**, **Free look Period**, Surrender |
| "Technical details / eligibility?" | **eligibility table** (entry age, maturity age, min sum assured) |
| "Features of the policy?" | features section (baseline — should still pass) |

Add an optional answer-level check via `demochat.py` (LLM-judge: does the answer
contain the ROP exclusion, the free-look window, the age/sum-assured figures?).

---

## 6. Implementation Order

| # | Item | Files | Effort | Impact |
|---|---|---|---|---|
| 1 | `RAG_TOP_K=8`, `RERANK_TOP_N=8`, `RERANK_FETCH_K=24` | `config.py` | XS | High (R3) |
| 2 | Install `cohere` + set key, `RERANK_ENABLED=true` | env / deps | XS | High (R3) |
| 3 | `RAG_QUALITY_DIRECTIVES` in `_build_system_prompt` | `agent.py` | XS | High (exclusions, repetition) |
| 4 | Extend `retrieval_quality_demo.py` eval cases | demo | S | measurement |
| 5 | Heuristic table captions | `by_structure.py` + parsers | M | High (R4) — needs re-ingest |
| 6 | Agentic multi-search directive | `agent.py` | XS | Medium |
| 7 | LLM table captions (flagged) | ingestion | M | Higher recall, cost |

**Phase 1 (do first, hours): #1–#4.** Config + prompt + eval — fixes most of R3
and the repetition, and gives a measurement baseline. Only external need is the
`cohere` key.
**Phase 2: #5–#6.** Table captioning (re-ingest) fixes R4 structurally.
**Phase 3: #7.** LLM captions / query expansion for the last mile.

---

## 7. Open Questions

1. **Reranker provider** — Cohere (key, best) vs sentence-transformers (local,
   +1.5 GB PyTorch)? Gates #2.
2. **Re-ingest scope** — table captions (#5) only help documents ingested after
   the change; do we re-ingest existing client docs, or apply going forward only?
3. **Context budget** — top_k 5→8 with `add_knowledge_to_context` grows the prompt;
   confirm it stays within the model's context + latency budget (gpt-4o-mini is
   fine; worth a token check).
4. **Caption placement** — prepend caption into the embedded chunk text (helps
   embedding + the LLM reads it) vs. store as metadata only (keeps chunk clean but
   needs prompt-time assembly). Recommend prepend for tables.

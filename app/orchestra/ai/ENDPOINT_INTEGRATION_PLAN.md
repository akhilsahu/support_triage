# Endpoint Integration Plan — New RAG + Session Flow into Chatbot & Ingestion

> **Status:** Planning — review before implementing.
> Goal: wire the new pipeline (IngestionService + ChunkingService + shared
> embedding + hybrid/rerank retrieval + Agno-native session store) into the
> existing **chatbot** and **ingestion** endpoints, and close the gaps that stop
> it working end-to-end in production.

---

## 0. Current State (verified in code)

### Chatbot — `app/api/customer.py`
- `customer_chat` (POST `/api/chat/{slug}`) and `customer_chat_stream`
  (`/api/chat/{slug}/stream`) call `build_executor(...)` → `.run()` / `.stream()`.
- `build_executor` (`core/factory.py`) returns **AgnoOrchestrator** when
  `settings.ORCHESTRATOR == "agno"`. **It already defaults to `"agno"`** — so the
  new session-aware orchestrator is the live path.
- AgnoOrchestrator already threads `session_id` + `user_id` into `arun()` and the
  factories already wire db + history + memory + reliable RAG (done previously).

### Ingestion
| Endpoint | Path | Parser | Chunker | Status |
|---|---|---|---|---|
| `documents.py` upload | `svc.parse()` (IngestionService) | `chunk_document` | ✅ new pipeline |
| `documents.py` URL (line ~582) | `document_parser.parse` (old) | `chunk_document` | ⚠️ old parser |
| `admin.py` upload | `document_parser.parse` (old, pypdf) | `chunk_document` | ❌ old parser |
| `knowledge_base.py` KB item | inline text, `strategy="inline"` | none | ⚠️ no chunking |

---

## 1. Gap Analysis (what actually blocks the new flow)

### G1 — Session id resolved AFTER the run (critical)
In `customer_chat`, `executor.run()` (line ~407) runs **before** `_persist_turn`
(line ~414) creates/resolves the canonical `ChatSession.id` (line ~327). So on the
**first message** the orchestrator runs with `session_id = req.session_id or "new"`
→ history + user-memory are keyed to `"new"`, not the real session. Turn 1 never
threads; only later turns (which send back the resolved id) work.

**Fix:** resolve/create the canonical `ChatSession` id **before** `build_executor`,
pass it as `session_id`, then have `_persist_turn` reuse it. Same for
`customer_chat_stream`.

### G2 — admin.py uses the old parser
`admin.py` imports `parse` from `app.rag.document_parser` (pypdf, no vision, no
table awareness, no new parsers). Should use `get_ingestion_service()` for parity
with `documents.py`.

### G3 — Residual `document_parser.parse` in documents.py URL path
The URL-ingestion branch (line ~582) still calls the old `parse`. Route through
`IngestionService` (or `HtmlParser.parse_url`) for consistency.

### G4 — KB items bypass chunking
`knowledge_base.py::_index_kb_item` stores whole text/qna items as one chunk
(`strategy="inline"`). Fine for short Q&A, but long `content` items won't be
chunked. Decide: keep inline for short items, route long ones through
`ChunkingService`.

### G5 — Session DB provisioning
`SESSION_STORE=postgres` needs the separate `agno_sessions` database to exist
(Agno creates tables, not the DB). Not managed by Alembic. Missing DB →
`build_session_db` preflight returns None → **stateless chat** (already fail-safe,
but session features silently off).

### G6 — Citation persistence
`_persist_turn` writes `ConversationLog`; confirm `result["citations"]` and
`rag_hit` are persisted (the orchestrator now returns native references).

---

## 2. Implementation Steps

### Step 1 — Fix chatbot session lifecycle (G1)  [highest value]
`app/api/customer.py`
- Add/extract a helper that resolves-or-creates the `ChatSession` and returns its
  id **before** running the executor (reuse the logic currently inside
  `_persist_turn`).
- `customer_chat`:
  ```
  session_id = await _ensure_session(db, org, chatbot, req.session_id)  # NEW, before run
  executor   = build_executor(org, active_agents, session_id=session_id,
                              conversation_id=req.conversation_id or session_id)
  result     = await executor.run(message=req.message)
  await _persist_turn(..., session_id=session_id, ...)   # reuse, don't re-create
  ```
- `customer_chat_stream`: same — resolve the id before `executor.stream()`.
- Result: `session_id` == `user_id` == `ChatSession.id`, stable from turn 1 →
  history + memory thread correctly.

### Step 2 — admin.py → IngestionService (G2)
`app/api/v1/admin.py`
- Replace `from app.rag.document_parser import ... parse` usage with
  `from app.orchestra.ai.ingestion import get_ingestion_service`; use
  `svc.is_supported()` / `svc.supported_extensions()` / `svc.parse()`, mirroring
  `documents.py`. Keep `chunk_document` (already new).

### Step 3 — documents.py URL path → IngestionService (G3)
`app/api/v1/documents.py`
- Swap the old `parse` in the URL branch for `HtmlParser.parse_url()` (via the
  ingestion package) or `svc.parse()`; drop the local `document_parser` import.

### Step 4 — KB item chunking (G4)
`app/api/v1/knowledge_base.py::_index_kb_item`
- For `content` longer than a threshold, build a `ParsedDocument` and run
  `chunk_document` (strategy from a `.txt`/`.md` extension) instead of a single
  inline chunk. Short Q&A stays inline. Preserves `kb_id`/`kb_name` metadata.

### Step 5 — Session DB provisioning + config (G5)
- Docs already updated (README): `createdb agno_sessions`.
- Add a startup log/among health checks: call `build_session_db(build_config())`
  once at boot and log `session.db.ready` / `session.db.unreachable` so ops see
  the state immediately (optional: expose in `/health`).
- `.env`: `ORCHESTRATOR=agno` (default), `SESSION_STORE=postgres`,
  `AGNO_SESSION_DB_NAME=agno_sessions`, history/memory/summary + rerank knobs.

### Step 6 — Persist citations + rag_hit (G6)
`app/api/customer.py::_persist_turn`
- Ensure `result.get("citations")` and `result.get("rag_hit")` are written to
  `ConversationLog` (schema already carries citations per earlier code). Verify
  the response model returns them to the widget.

### Step 7 — End-to-end verification
- `demochat.py` already proves the orchestrator path. Add an API-level check:
  hit `/api/chat/{slug}` twice with the same returned `session_id` and assert the
  follow-up resolves history (turn-2 pronoun) and citations are populated.

---

## 3. Order, Risk, Dependencies

| # | Step | Files | Risk | Priority |
|---|---|---|---|---|
| 1 | Session lifecycle (resolve id before run) | `customer.py` | Med | **P0** — without it history/memory don't thread on turn 1 |
| 5 | Provision `agno_sessions` DB + boot check + env | ops, `main.py` | Low | **P0** — session features off until DB exists |
| 2 | admin.py → IngestionService | `admin.py` | Low | P1 |
| 6 | Persist citations/rag_hit | `customer.py` | Low | P1 |
| 3 | documents.py URL path parser | `documents.py` | Low | P2 |
| 4 | KB item chunking | `knowledge_base.py` | Med | P2 |
| 7 | API-level e2e verification | test/demo | — | P1 |

**Minimal go-live = Steps 1 + 5** (+ create the DB): the new orchestrator is
already default, so fixing the session id and provisioning the DB turns on
history/memory/grounding for real. Steps 2–4 are ingestion parity/cleanup.

---

## 4. Rollout & Fallback

- **Feature flag already exists:** `ORCHESTRATOR` (`agno` | `dynamic`). If the new
  flow misbehaves, set `ORCHESTRATOR=dynamic` to fall back to
  `DynamicAgentExecutor` (legacy, stateless, direct `VectorStore.query`).
- **Session store flag:** `SESSION_STORE=none` disables session persistence
  without touching the orchestrator (stateless-but-working chat).
- No data migration: ChromaDB collection unchanged; `agno_sessions` is a fresh,
  separate DB.

---

## 5. Open Questions

1. **Session creation ownership** — is it safe to create the `ChatSession` row
   before the AI runs (Step 1)? Confirm no code assumes the row appears only
   after a successful turn (e.g. analytics, empty-session cleanup).
2. **`user_id` vs multi-session memory** — user_id = ChatSession id means memory
   is per-conversation. If cross-conversation customer memory is ever wanted,
   thread a stable customer id instead. (Decided: session-scoped for now.)
3. **KB inline threshold** (Step 4) — char count above which a KB `content` item
   gets chunked vs stored inline?
4. **DynamicAgentExecutor retirement** — once the agno path is validated in prod,
   do we remove the legacy executor + direct `VectorStore.query` path (the
   earlier "Phase 3" migration), or keep it as the fallback indefinitely?

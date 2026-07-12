# Agno-Native Session, History, Memory & Context — Implementation Plan

> **Status: IMPLEMENTED (steps 1–8).** Backend: **PostgresDb** on its own
> database `agno_sessions` (separate from the app DB), derived from
> `settings.database_url_sync`. `user_id` = `session_id` = ChatSession id.
> Memory write uses `update_memory_on_run` (not the deprecated
> `enable_user_memories`). Verified: config derivation, the shared
> `session_runner_kwargs` helper wires every native knob onto a real Agno
> object, all touched files compile + import.
>
> **One external prerequisite:** create the empty `agno_sessions` database on
> the Postgres server (Agno auto-creates its tables inside it, but not the
> database itself). Override name/URL via `AGNO_SESSION_DB_NAME` /
> `AGNO_SESSION_DB_URL`; set `SESSION_STORE=sqlite` or `none` to opt out.

---

## 0. Keystone

Agno's history, user-memory, and session-summary features **all persist through
one `db` object**. Today the code builds an Agno-native `MemoryManager` but never
passes a `db` and never flips the enabling flags — so nothing actually works.

Fix: wire **one shared Agno `db`**, then turn on native flags. No custom session
state, no custom history, no custom scoping.

Driver: `PostgresDb(db_url=settings.database_url_sync)` — `database_url_sync`
already exists (`app/config.py:225`), strips `+asyncpg` → psycopg2 (installed).

---

## 1. Framework placement nuance (important)

In route/coordinate mode the **Team leader** owns the conversation; **member
agents** own retrieval. So the knobs split:

| Concern | Goes on | Why |
|---|---|---|
| `db`, `add_history_to_context`, `num_history_runs` | **Team** (leader) + single-Agent case | history is a conversation-level concern |
| `enable_user_memories`, `add_memories_to_context`, `memory_manager`, `user_id` | **Team** (leader) + single-Agent case | memory is per-user/conversation |
| `enable_session_summaries`, `add_session_summary_to_context` | **Team** (leader) + single-Agent case | summary condenses the conversation |
| `knowledge`, `knowledge_filters`, `add_knowledge_to_context`, `search_knowledge` | **member Agents** + single-Agent case | RAG is per-specialist |

`TeamFactory.build()` returns a bare Agent when there's a single specialist — that
agent must carry **both** sets.

---

## 2. Config additions — `core/config.py`

Add to `OrchestraConfig` (framework-agnostic) / `AgnoConfig`:

```python
# Session store (Agno db) — backs history, memories, summaries
session_store:        str  = "postgres"   # postgres | sqlite | none
session_db_url:       str  = ""           # default: settings.database_url_sync
session_db_schema:    str  = "ai"         # keep Agno tables out of app schema

# Native history
history_enabled:      bool = True
num_history_runs:     int  = 5

# Native user memory (activates the MemoryManager already built)
user_memories_enabled: bool = False       # opt-in; needs real user_id

# Native session summaries (optional; for long chats)
session_summaries_enabled: bool = False

# Reliable RAG grounding (traditional RAG injection, not agentic-only)
add_knowledge_to_context: bool = True
```

Wire them in `build_config()` from env (`SESSION_STORE`, `NUM_HISTORY_RUNS`,
`USER_MEMORIES_ENABLED`, `SESSION_SUMMARIES_ENABLED`, `ADD_KNOWLEDGE_TO_CONTEXT`),
`session_db_url` defaulting to `settings.database_url_sync`.

---

## 3. New: shared db builder — `app/orchestra/ai/session/store.py`

Pluggable like the knowledge backend (framework-native, swappable):

```python
def build_session_db(cfg):
    if cfg.session_store == "none":
        return None
    if cfg.session_store == "postgres":
        from agno.db.postgres import PostgresDb
        return PostgresDb(db_url=cfg.session_db_url, db_schema=cfg.session_db_schema)
    if cfg.session_store == "sqlite":
        from agno.db.sqlite import SqliteDb
        return SqliteDb(db_file=".agno_sessions.db")
    raise ValueError(...)
```

Built once (module singleton, like `_knowledge_backend` in orchestrators/agno.py).

---

## 4. Edits — `factories/agent.py` (`AgentFactory.build`)

Add to the `Agent(...)` call:
```python
# CONTEXT (reliable RAG) — member agents + single-agent case
add_knowledge_to_context = self.cfg.add_knowledge_to_context,   # NEW
# search_knowledge stays as-is (agentic follow-ups)

# HISTORY/MEMORY only when this agent is standalone (single specialist).
# In a Team these live on the leader (see §1) — pass a `role="leader"` flag or
# a separate build path so members don't double-store history.
```
Suggestion: add a `for_leader: bool = False` (or a dedicated `build_leader()`)
so the factory knows whether to attach session/history/memory. Members get
knowledge only; leader/standalone gets session + history + memory.

Remove `add_history_to_context=False` hardcode.

---

## 5. Edits — `factories/team.py`

`build_for_pool()` already owns tools + memory setup — add `db` + `user_id`
there and pass down:
```python
db = build_session_db(cfg)                    # NEW
...
Team(
    ...,
    db=db,                                     # NEW
    add_history_to_context=cfg.history_enabled,        # NEW
    num_history_runs=cfg.num_history_runs,             # NEW
    update_memory_on_run=cfg.user_memories_enabled,    # NEW (enable_user_memories is deprecated)
    add_memories_to_context=cfg.user_memories_enabled, # NEW
    enable_session_summaries=cfg.session_summaries_enabled,       # NEW
    add_session_summary_to_context=cfg.session_summaries_enabled, # NEW
    memory_manager=memory,                     # already built (Agno-native)
    user_id=user_id,                           # NEW (threaded from pool)
)
```
Single-agent path: pass the same session/history/memory knobs onto that Agent.

---

## 6. Simplify — `factories/memory.py`

`MemoryManager` is already Agno-native — keep it, but drop the workaround:
- **Remove** `user_id=session_id` scoping hack (memory keyed by session).
- Build `MemoryManager(model=llm)`; let Agno scope memories by the real
  `user_id` + `db` at the Team/Agent level.
- Memory only persists once `db` + `enable_user_memories` are set (§5).

---

## 7. Edits — `orchestrators/agno.py` + `session/pool.py`

- Thread a real **`user_id`** (end-customer id) from the API → `SessionPool` →
  `TeamFactory.build_for_pool` → Team. Fallback to `session_id` only if no
  customer id exists.
- `run()/stream()` already pass `session_id` to `arun()` — keep.
- **Suggestion (Step 6 / native citations):** once `add_knowledge_to_context`
  is on, prefer Agno's response references over the hand-rolled
  `_extract_citations()` tool-message parser. Verify the reference shape on
  `RunOutput` first; keep `_extract_citations` as fallback until confirmed.
- The pool caches one Team per `{space_id}:team` — unchanged and correct: one
  Team object serves many sessions via `db` + `session_id`. Its "history is
  isolated by session_id" comment becomes TRUE once the db is wired.

---

## 8. Implementation order

| # | Step | Files | Risk |
|---|---|---|---|
| 1 | Config knobs + `database_url_sync` default | `core/config.py` | Low |
| 2 | `build_session_db()` (Postgres) | `session/store.py` (new) | Low |
| 3 | Reliable grounding: `add_knowledge_to_context` | `agent.py` | Low |
| 4 | History on Team/standalone: db + add_history + num_history | `team.py`, `agent.py` | Med |
| 5 | Thread `user_id` API→pool→team | `customer.py`, `pool.py`, `team.py`, `orchestrators/agno.py` | Med |
| 6 | Activate user memories (needs #5) | `team.py`, `memory.py` | Med |
| 7 | Session summaries (optional) | `team.py` | Low |
| 8 | Native citations (optional cleanup) | `orchestrators/agno.py` | Low |

**Minimal first slice = #1–#4:** db + history + reliable grounding. That alone
makes the chatbot remember turns and stop hallucinating over retrieved facts.

---

## 9. Open questions / decisions

1. **`user_id` source** — what's the real end-customer identifier in
   `ChatSession`? Needed for native user memories (#5/#6). If none, memories are
   effectively session-scoped (pass `user_id=session_id`) — acceptable but not
   cross-session.
2. **Agno schema isolation** — put Agno's tables in a separate Postgres schema
   (`ai`) so they don't collide with app/Alembic tables. Confirm migrations
   ownership (Agno auto-creates its tables).
3. **psycopg driver** — psycopg2 is installed; `database_url_sync`
   (`postgresql://…`) works. No psycopg3 needed.
4. **Memory cost** — `enable_user_memories` runs an extra LLM call per turn to
   extract memories. Keep opt-in (`user_memories_enabled=False`) until wanted.
5. **Summaries vs history size** — with `session_summaries_enabled`, keep
   `num_history_runs` small (e.g. 3) to cap token cost on long chats.

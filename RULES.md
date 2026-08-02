# OrchestraSupport — Development Rules

Critical rules established through debugging. Do not violate these.

---

## Naming — Space vs Org

- **Never use `org` terminology in frontend code.** The entity is called a **space** everywhere.
- Store fields: `spaceId`, `spaceSlug`, `spaceName` — not `orgId`, `orgSlug`, `orgName`.
- TypeScript interfaces and local variables must use `space` / `Space` — not `org` / `Org`.
- Display text must say "space" — not "org" or "organization".
- API endpoint paths (e.g. `/orgs/...`) and backend response field names (e.g. `total_orgs`, `org_id`) are backend contract — do not rename those in fetch URLs or response type field names that map directly to wire format. But rename the local variable that holds the data (e.g. `setSpaces(o.orgs)`).

---

## Identity & Auth

- **`org.id` (UUID) is the `client_id`** everywhere — ChromaDB metadata, KB queries, ownership checks, chat pipeline. Never use `org.slug` as an identifier. Slugs are display-only.
- **`org.display_name`** is the org name field. The `Organization` model has no `.name` attribute.
- **JWT secret and config** must come from `settings` (pydantic-settings), never from `os.environ.get()`. pydantic-settings loads `.env`; `os.environ.get()` does not.
- **`HTTPBearer` returns 403** (not 401) when no token is provided. A 403 on a protected endpoint means no Authorization header was sent.

---

## Frontend Store

- **Zustand localStorage key is `orchestra-store`**, not `app-storage`. The axios interceptor must read from `orchestra-store`.
- **Store fields**: `token`, `spaceId`, `spaceSlug`, `spaceName`. All four are persisted. `spaceId` is the UUID; `spaceSlug` is display-only.
- **`setAuth` signature**: `(token, spaceId, spaceSlug, spaceName)` — four args, `spaceId` first after token.

---

## File Upload (Axios + FastAPI)

- **Never set `Content-Type: multipart/form-data` manually** on FormData requests. Axios must set it automatically to include the boundary. Pass `'Content-Type': undefined` in per-request headers to override the instance default of `application/json`.
- The axios instance is created with `headers: { 'Content-Type': 'application/json' }` — this must be overridden for every multipart upload.

---

## ChromaDB / Vector Store

- **Every chunk must have these metadata fields**: `client_id` (org UUID), `org_id` (org UUID), `org_name` (display name), `kb_name`, `doc_name` (filename alias), `filename`, `doc_type`, `description`, `uploaded_at`, `expires_at`.
- `client_id` and `org_id` both store `str(org.id)` — they are the same value, both present for query flexibility.
- **`SupportAgent` queries ALL doc types** (`client_where` not `client_doc_type_where`). Never restrict to a single doc type when answering customer questions.
- **`/rag/list` reads from ChromaDB directly** (`store.get_client_docs(str(org.id))`), not from the in-memory `_rag_docs` dict. The in-memory dict is lost on restart; ChromaDB persists.
- **Delete ownership check**: always verify `client_id == str(org.id)` in ChromaDB before deleting.

---

## RAG API Security

- `/rag/upload`, `/rag/list`, `/rag/{doc_id}` (delete), `/rag/client/{client_id}` — all require `Depends(current_brand)`.
- `/rag/client/{client_id}` enforces `client_id == str(org.id)` from JWT. No cross-org queries.
- `client_id` in upload is always derived from `str(org.id)` — never trusted from request headers.

---

## PostgreSQL / Docker

- **Always use `127.0.0.1:5432`**, not `localhost`. On macOS, `localhost` resolves to IPv6 (`::1`), which Docker does not bind.
- **Local Homebrew postgres respawns** after `kill -9` because launchd manages it. Stop it permanently with `brew services stop postgresql@<version>` or `launchctl unload ~/Library/LaunchAgents/homebrew.mxcl.postgresql*.plist`.
- **Alembic** uses the sync psycopg2 URL (no `+asyncpg`). Set in `alembic.ini`: `postgresql://postgres:postgres@127.0.0.1:5432/multiagent`.
- **App** uses asyncpg URL: `postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/multiagent`.

---

## Python / Dependencies

- **bcrypt** must be pinned to `bcrypt==4.0.1`. Newer versions cause `ValueError` on password hashing with passlib.
- **Alembic migrations** are numbered `0001_`, `0002_`, `0003_` etc. and chain via `down_revision`.
- **`Organization` relationships** use `back_populates="org"` (not `"brand"`). ForeignKeys reference `"organizations.id"` (not `"brands.id"`).

---

## Chat Pipeline

- `ChatRequest` includes `org_id: Optional[str]` — the org UUID sent from the frontend.
- The support agent is called on **every chat message** when `org_id` is present, not only on `tech_support` routing. KB context is injected if there are hits.
- `org_id` is persisted in conversation state across turns so the frontend only needs to send it once.

---

## Directory Structure

```
app/
├── agents/
│   ├── support_agent.py       — SupportAgent (KB RAG + org-scoped queries); aliases TechSupportAgent
│   ├── triage_agent.py        — Routes messages to the right agent
│   ├── finance_agent.py       — Handles billing/finance queries
│   ├── logistics_agent.py     — Handles shipping/logistics queries
│   ├── order_agent.py         — Handles order status queries
│   ├── empathy_engine.py      — Sentiment analysis + empathetic response layer
│   └── dynamic_executor.py    — Generic LLM executor used by agents
├── api/
│   ├── chat.py                — POST /chat — main chat pipeline, triage + agent dispatch
│   ├── auth.py                — POST /auth/register, /auth/login — JWT issuance
│   ├── org.py                 — Org CRUD
│   ├── brand.py               — Brand endpoints
│   ├── customer.py            — Customer endpoints
│   ├── db_utils.py            — Shared DB helpers
│   └── v1/
│       ├── documents.py       — /rag/* endpoints (upload, list, delete, client KB chat)
│       ├── dashboard.py       — Dashboard stats
│       ├── agents.py          — Agent status endpoints
│       ├── admin.py           — Admin panel endpoints
│       ├── superadmin.py      — Superadmin endpoints
│       ├── tasks.py           — Task management endpoints
│       └── workflows.py       — Workflow endpoints
├── core/
│   ├── auth.py                — JWT decode, current_brand dependency
│   ├── database.py            — Async SQLAlchemy engine + session factory
│   └── redis.py               — Redis client
├── models/
│   ├── org.py                 — Organization model (id UUID, slug, display_name, …)
│   ├── document.py            — Document model (org_id FK → organizations.id)
│   ├── agent.py               — Agent config model
│   ├── brand.py               — Brand model
│   ├── conversation.py        — Conversation + Message models
│   ├── task.py                — Task model
│   ├── workflow.py            — Workflow model
│   └── execution.py           — Execution log model
├── rag/
│   ├── vector_store.py        — ChromaDB wrapper; upsert_client_chunks, get_client_docs, client_where
│   ├── document_parser.py     — PDF/DOCX/TXT text extraction
│   ├── chunking.py            — Text chunking strategies
│   ├── embedder.py            — Embedding model wrapper
│   ├── retriever.py           — Similarity search helpers
│   └── chain.py               — RAG chain (retrieve → prompt → LLM)
├── services/
│   ├── llm_service.py         — LLM provider abstraction
│   ├── rag_service.py         — High-level RAG orchestration
│   └── crm_service.py         — CRM integration helpers
├── mock/
│   ├── users.py               — Mock user data for dev
│   └── products.py            — Mock product data for dev
├── config.py                  — pydantic-settings Settings (JWT secret, DB URL, etc.)
└── main.py                    — FastAPI app entry point, router registration

ui/src/
├── screens/
│   ├── Chat.tsx               — Chat UI; reads orgId from store, sends to /chat
│   ├── KnowledgeBase.tsx      — Doc list + UploadModal; org-scoped via JWT
│   ├── Dashboard.tsx          — Dashboard overview
│   ├── Agents.tsx             — Agent status page
│   ├── Analytics.tsx          — Analytics page
│   ├── Settings.tsx           — Org settings
│   ├── Login.tsx              — Login + register; calls setAuth(token, orgId, orgSlug, orgName)
│   └── SuperAdmin.tsx         — Superadmin panel
├── components/
│   ├── layout/
│   │   ├── Header.tsx         — Top nav bar
│   │   ├── Sidebar.tsx        — Side navigation
│   │   └── Layout.tsx         — Shell wrapping sidebar + header + content
│   └── ui/
│       ├── Button.tsx, Card.tsx, Badge.tsx, Toggle.tsx, StatusDot.tsx
│       ├── SkeletonLoader.tsx  — ChatSkeleton and other loading states
│       ├── SourceCitation.tsx  — RAG source chips shown below assistant messages
│       └── cn.ts              — clsx/twMerge helper
├── api/
│   └── client.ts              — Axios instance (baseURL, JWT interceptor); all apiClient methods
├── store/
│   └── useAppStore.ts         — Zustand store; persisted to localStorage key "orchestra-store"
│                                 fields: token, orgId, orgSlug, orgName, messages, conversationId, activeAgent
├── config/
│   ├── api.ts                 — API_CONFIG (baseURL, endpoints, QUICK_ACTIONS)
│   ├── navigation.ts          — NAV_ITEMS (sidebar links)
│   ├── theme.ts               — getAgentTheme, getSentimentColor helpers
│   └── agents.ts              — Agent display metadata
└── types/
    └── index.ts               — Message, RagDoc, and other shared TypeScript types

alembic/versions/
├── 19fd7781d00f_initial.py    — Initial schema
├── 0002_brand_tables.py       — Brand/org tables
└── 0003_add_org_id_to_documents.py — org_id FK on documents table
```

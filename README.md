# FastAPI Multi-Agent Backend

A production-ready FastAPI backend for AI Support multi-agent systems with RAG (Retrieval-Augmented Generation) capabilities, vector storage, and workflow orchestration.

## 🚀 Features

- **Multi-Agent System**: Support for multiple AI agent types with orchestration
- **RAG Implementation**: Document storage with vector embeddings using pgvector
- **Per-Agent Knowledge Base Scoping**: Every custom agent is wired to one or more
  Knowledge Bases (`agent_knowledge_bases` join table) and, at retrieval time,
  searches **only** the KB(s) it is assigned to. Scoping is enforced as a layered
  ChromaDB metadata filter built in `_make_filters()`
  (`app/orchestra/ai/knowledge/agno_chroma.py`), all conditions ANDed:
    - `client_id == space_id` — hard tenant/space isolation (always applied)
    - `kb_id $in [linked KB ids]` — custom agents: only their assigned Knowledge Bases
    - `doc_type $in [categories]` — builtin agents: only their configured categories

  Every chunk is tagged with `client_id`, `kb_id`, `doc_id`, and `doc_type` at
  ingestion, so an agent with no matching KB documents retrieves nothing rather than
  leaking another KB's content. **An agent with no scoping at all (no linked KB and
  no builtin category) is given no knowledge and performs no retrieval — it never
  falls back to searching the whole space.**
- **Workflow Engine**: Sequential, parallel, and conditional agent execution
- **Vector Search**: Efficient similarity search with PostgreSQL pgvector extension
- **Real-time Communication**: WebSocket support for live updates
- **Caching Layer**: Redis integration for performance optimization
- **Task Queue**: Celery for async task processing
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation
- **Production Ready**: Comprehensive logging, monitoring, and error handling

## 🤖 Multi-Chatbot per Space

A space can run one or many chatbots, gated by a limit the super-admin controls.

**Schema** (migration `0022_chatbot_limits`):
- `platform_settings.default_max_chatbots INT DEFAULT 1` — global cap for all spaces.
- `spaces.max_chatbots INT NULL` — per-space override; `NULL` = inherit global, `-1` = unlimited.
- Effective limit = `spaces.max_chatbots ?? platform_settings.default_max_chatbots`
  (`app/utils/chatbot_limits.py`).

**Admin control** (Super Admin → Organizations tab):
- Master "Chatbots per space — default for all" presets (None/Up to 3/Up to 10/Unlimited).
- Per-row **Chatbots** dropdown (`Inherit / 1 / 2 / 3 / 5 / 10 / ∞`) writing `spaces.max_chatbots`
  via `PATCH /super-admin/orgs/{id}`.

**Owner UX** (dashboard → Chatbot Profile): single-bot spaces see just their bot; multi-bot
spaces get create / set-default / delete (gated by `GET /api/v1/chatbots/quota`). New bots start
with only the required Triage builtin enabled — same as a space's very first chatbot at
registration — so they don't silently inherit another bot's branded custom agents. The owner
creates/enables the right agents for each bot's actual purpose.

**Customer routing**:
- `/<space_slug>` → default chatbot (unchanged).
- `/<space_slug>/<chatbot_slug>` → a specific chatbot. The frontend forwards `?chatbot=<slug>` to
  `/api/chat/...` and `/api/v1/space/public/...`; unknown slugs fall back to the default bot.
- Agents are resolved per `chatbot_id`; the session pool caches agents per `space_id:chatbot_id`.

## 🧭 Terminology & Naming Convention

**Use `space`, never `org`.** A tenant is a **Space** (`spaces` table, `space_id`
everywhere). The codebase is migrating off the older "org" terminology — all **new**
code, files, routes, components, and identifiers must use `space`:

- New router files → `space_*.py` with `/space/...` prefixes (not `org_*.py` / `/org/...`).
- New UI components → `SpaceSearch`, `SpaceX` (not `OrgSearch`, `OrgX`).
- New identifiers/vars → `space_id`, `spaceSlug` (not `org_id`, `orgSlug`).

> ⚠️ **Legacy `org`-named surfaces still live** (do not break; rename only via a
> coordinated frontend + backend migration): `/api/v1/org/agents`, `/api/v1/org/kb`
> (served by `space_agents.py`), and `/api/v1/orgs` (super-admin). These paths are
> still called by the frontend and are pending a future rename.

## 📋 Prerequisites

- Python 3.11+
- PostgreSQL 15+ with pgvector extension
- Redis 7+
- Poetry (recommended) or pip

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bob-watson-hackathon
```

### 2. Install Dependencies

**Using Poetry (Recommended):**
```bash
poetry install
poetry shell
```

**Using pip:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Set Up PostgreSQL with pgvector

```bash
# Install PostgreSQL (if not already installed)
# macOS
brew install postgresql@15

# Ubuntu/Debian
sudo apt-get install postgresql-15

# Install pgvector extension
# macOS
brew install pgvector

# Ubuntu/Debian
sudo apt-get install postgresql-15-pgvector
```

Start PostgreSQL and create the database:
```bash
# macOS — start the service
brew services start postgresql@15

# Ubuntu/Debian
sudo systemctl start postgresql

# Create the database
createdb multiagent
```

Enable pgvector in your database:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Set Up Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis
```
Using Docker Compose

```
docker-compose up postgres redis adminer -d

```

### 5. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database connection URL
- Redis URL
- OpenAI/Anthropic API keys
- Other settings as needed

### 6. Initialize Database

```bash
# Run Alembic migrations
alembic upgrade head

# Or initialize directly (for development)
python -c "from app.core.database import init_db; import asyncio; asyncio.run(init_db())"
```

## 🚀 Running the Application

### Development Mode

```bash
# Using uvicorn directly
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Or using the main.py script
python -m app.main
```

### Production Mode

```bash
# Using Gunicorn with Uvicorn workers
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --log-level info
```

### Using Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📚 API Documentation

Once the application is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

### Chat API boundaries

- `/api/chat/{space_slug}` and `/api/chat/{space_slug}/stream` are the production
  customer-chat APIs. They resolve a chatbot-scoped agent fleet and execute it
  through the shared production runtime in `app/orchestra/ai/`.
- `/api/v1/chat` is the legacy/demo e-commerce chat API. It uses mock customer
  and order data and must not be used as the production customer-chat path.
- Production chat lifecycle analytics are stored as redacted, append-only
  `conversation_events`; message content and model reasoning remain in their
  existing tenant-scoped message tables rather than being copied into events.

### Evaluation API and headless runner

Authenticated space owners can create deterministic chatbot evaluation suites
under `/api/v1/evaluations`. The backend stores suites and cases, grades
normalized results for expected agents, terms, sources, RAG, escalation, and
latency, and records run history.

`POST /api/v1/evaluations/suites/{suite_id}/runs` executes up to 50 enabled
cases sequentially against the suite's active chatbot and therefore incurs
normal model/retrieval cost. It calls the canonical executor directly rather
than the public chat API: each case uses a unique evaluation session, external
actions and clarification are unavailable, escalation intent is observed but
not performed, and no customer sessions, conversation events, inbox transfers,
reasoning, or tool payloads are persisted. Only the current published runtime
is supported until versioned draft configuration exists. Results are available
from `GET /api/v1/evaluations/runs/{run_id}/results`.

Authenticated owners can operate this workflow from `/app/evaluations`. The
Evaluation Lab creates chatbot-bound suites and deterministic cases, confirms
real provider cost before execution, and displays run history, actual answers,
sources, latency, escalation intent, and every pass/fail check. It supports the
current customer-serving runtime only. Editing/deleting cases, structured
conversation context, draft comparison, CSV import, background progress, and
publish gating remain future work.

## 🏗️ Project Structure

```
fastapi-multi-agent-backend/
├── app/
│   ├── api/v1/              # API endpoints
│   │   ├── agents.py        # Agent management
│   │   ├── workflows.py     # Workflow orchestration
│   │   ├── tasks.py         # Task execution
│   │   └── documents.py     # Document & RAG
│   ├── models/              # SQLAlchemy models
│   │   ├── agent.py         # Agent model
│   │   ├── workflow.py      # Workflow model
│   │   ├── task.py          # Task model
│   │   ├── document.py      # Document model with vectors
│   │   ├── execution.py     # Execution history
│   │   └── conversation.py  # Chat history
│   ├── schemas/             # Pydantic schemas
│   ├── services/            # Business logic
│   ├── core/                # Core functionality
│   │   ├── database.py      # Database connection
│   │   └── redis.py         # Redis client
│   ├── agents/              # Agent implementations
│   ├── workflows/           # Workflow engine
│   ├── rag/                 # RAG implementation
│   ├── utils/               # Utilities
│   ├── config.py            # Configuration
│   └── main.py              # FastAPI application
├── alembic/                 # Database migrations
├── tests/                   # Test suite
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
├── docker/                  # Docker configuration
├── .env.example             # Environment template
├── pyproject.toml           # Poetry configuration
├── requirements.txt         # Pip requirements
└── README.md               # This file
```

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Application
APP_NAME=FastAPI Multi-Agent Backend
DEBUG=false
LOG_LEVEL=INFO

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/multiagent

# Redis
REDIS_URL=redis://localhost:6379/0

# AI APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Embeddings
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384

# RAG
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.7
RAG_CHUNK_SIZE=1000
```

## 🧠 RAG Pipeline, Reranking & Session Memory

The `app/orchestra/ai/` pipeline is: **ingestion → chunking → embedding →
retrieval (hybrid + optional rerank) → Agno agent (knowledge + session memory)**.
Standalone demo scripts (functional params at the top of each `main()`, no CLI
args) validate each stage:

```bash
python -m app.orchestra.ai.ingestion.demo    # parse a file → ParsedDocument
python -m app.orchestra.ai.chunking.demo      # parse → chunk (strategy per type)
python -m app.orchestra.ai.knowledge.demo     # ingest → hybrid retrieval (+ rerank)
python -m app.orchestra.ai.demochat           # full chat via the real orchestrator
```

### Embedding

Write path (ChromaDB) and read path (Agno) build from one shared config so model
and dimensions can never drift.

```bash
EMBEDDING_MODEL=text-embedding-3-small       # or text-embedding-3-large
EMBEDDING_DIMENSION=1536                      # 3072 for -large
```

### Reranking (optional — off by default)

Pluggable providers. Disabled unless `RERANK_ENABLED=true`; if enabled without the
provider installed it **degrades gracefully to no-rerank** (logs a warning, chat
still works).

```bash
RERANK_ENABLED=false                          # true to turn on
RERANK_PROVIDER=cohere                         # cohere | sentence_transformer | none
RERANK_MODEL=                                  # blank = provider's own default
RERANK_TOP_N=5                                 # final chunks after rerank
RERANK_FETCH_K=20                              # candidates fetched before rerank
COHERE_API_KEY=                                # required for provider=cohere
```

Provider install (only one needed, only if you enable reranking):

| Provider | Install | Notes |
|---|---|---|
| `cohere` | `pip install cohere` (in requirements) + set `COHERE_API_KEY` | Hosted, lightweight, best quality |
| `sentence_transformer` | `pip install sentence-transformers` | **Local, no API key**, but pulls in **PyTorch (~1.5 GB)** — install only if you deliberately want the local reranker (commented out in `requirements.txt`) |

To plug in a new reranker: register a builder under a name in
`app/orchestra/ai/knowledge/reranking/` (`@register("name")`) and set
`RERANK_PROVIDER=name` — no other code changes.

### Session store — history, user memory, summaries (Agno-native)

Conversation history, per-user memory, and rolling summaries are Agno features
backed by **one `db`**. It lives on its **own Postgres database** (`agno_sessions`),
separate from the app DB, so Agno's auto-created tables never collide with the
Alembic-managed schema. `session_id` and `user_id` are both the `ChatSession` id.

```bash
SESSION_STORE=postgres                         # postgres | sqlite | none
AGNO_SESSION_DB_NAME=agno_sessions             # separate DB on the same PG server
AGNO_SESSION_DB_URL=                           # explicit url; blank = derive from DATABASE_URL
AGNO_SESSION_DB_SCHEMA=public
HISTORY_ENABLED=true
NUM_HISTORY_RUNS=5                             # prior turns fed back into context
USER_MEMORIES_ENABLED=true                     # extract/recall user facts
SESSION_SUMMARIES_ENABLED=true                 # condense long conversations
ADD_KNOWLEDGE_TO_CONTEXT=true                  # reliable RAG grounding (not agentic-only)
```

**Required one-time setup** — create the separate database (Agno auto-creates its
*tables* inside it, but not the database itself):

```bash
createdb agno_sessions
# or: psql -c "CREATE DATABASE agno_sessions;"
```

If that database is missing/unreachable, `build_session_db` runs a `SELECT 1`
preflight, logs `session.db.unreachable`, and **degrades to stateless chat**
(session features off, but messages still answer) rather than failing every
request. Set `SESSION_STORE=sqlite` for local/dev (auto-creates a file) or
`SESSION_STORE=none` to disable session persistence entirely.

> **Cost note:** `USER_MEMORIES_ENABLED` and `SESSION_SUMMARIES_ENABLED` each add
> an LLM call per turn. Set them to `false` and rely on `NUM_HISTORY_RUNS` alone
> to minimise token usage until you need them.

## 📖 Usage Examples

### Creating an Agent

```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/v1/agents",
        json={
            "name": "Customer Support Agent",
            "type": "chat",
            "description": "Handles customer inquiries",
            "capabilities": ["chat", "faq", "escalation"],
            "configuration": {
                "model": "gpt-4-turbo-preview",
                "temperature": 0.7
            }
        }
    )
    agent = response.json()
    print(f"Created agent: {agent['id']}")
```

### Creating a Workflow

```python
response = await client.post(
    "http://localhost:8000/api/v1/workflows",
    json={
        "name": "Customer Inquiry Workflow",
        "execution_type": "sequential",
        "steps": [
            {
                "agent_id": "agent-1-uuid",
                "name": "Classify Inquiry",
                "config": {}
            },
            {
                "agent_id": "agent-2-uuid",
                "name": "Generate Response",
                "config": {}
            }
        ]
    }
)
```

### Uploading Documents for RAG

```python
# Upload a document
with open("document.pdf", "rb") as f:
    response = await client.post(
        "http://localhost:8000/api/v1/documents/upload",
        files={"file": f}
    )

# Query using RAG
response = await client.post(
    "http://localhost:8000/api/v1/rag/query",
    json={
        "query": "What is the refund policy?",
        "top_k": 5
    }
)
answer = response.json()
```

Ingestion is asynchronous: `POST /rag/upload` and `POST /rag/ingest-url` return `202`
with a `job_id`, and progress is polled via `GET /documents/ingestion-jobs`. A failed
or restart-interrupted job keeps its replayable payload on the row and can be
re-queued with `POST /documents/ingestion-jobs/{job_id}/retry` — so a large PDF
killed by a server restart is resumed with Retry instead of forcing a re-upload.
File jobs replay the original temp bytes; URL jobs re-fetch the page when the
cached bytes are gone. See `docs/ingestion-async-and-ratelimit-plan.md` for the
design.

### Chain-of-thought / reasoning

When the configured model produces reasoning (e.g. a reasoning model like
`deepseek-reasoner`), the chain-of-thought is captured and persisted to the
`message_thoughts` table — one row per assistant message, keyed by
`message_id` (FK → `conversation_logs.id`). Migration: `0041_message_thoughts`.

- `content` holds the merged reasoning text; `segments` keeps per-delta
  granularity `[{seq, content}]` for faithful replay of streamed runs.
- `space_id`/`session_id`/`chatbot_id`/`agent_slug` are denormalized copies of
  the owning `ConversationLog` for analytics joins.
- Reasoning is **never** written into `conversation_logs.message` — the
  customer-facing transcript stays clean.
- The customer widget streams reasoning live as `event: reasoning` SSE chunks
  (collapsible "Thinking…" block), and the `done` event carries the full
  `reasoning` text. Non-streaming `POST /api/chat/{slug}` returns `reasoning`
  on `CustomerChatResponse`. Session-history endpoints (`/chat/{slug}/session/
  {id}` and `/chat-sessions/{id}`) attach `reasoning` per message on restore.

### Per-agent model & reasoning-effort overrides

Each chatbot and each agent (built-in or custom) can override the LLM model and
the reasoning effort. The model is entered as a free-text provider-prefixed id
(e.g. `openai/gpt-4o-mini`, `deepseek/deepseek-reasoner`); the effort is one of
`Off` / `Low` / `Medium` / `High`. Override resolution order:

1. **Agent override** — `space_builtin_agent_configs.llm_model` /
   `reasoning_effort` or `custom_agents.llm_model` / `reasoning_effort`.
2. **Chatbot override** — `chatbots.llm_model` / `reasoning_effort`.
3. **Env default (config)** — `LLM_MODEL` / `REASONING_EFFORT` (`AgnoConfig`).

A `NULL` (UI: "Inherit") at any level falls through to the next level down; the
env default for `REASONING_EFFORT` is `""` (off), so reasoning is off unless a
level sets `low`/`medium`/`high`. `""` (UI: "Off") is stored distinctly and
forces reasoning off even when the config default has it on. A model id
containing `/` routes to OpenRouter and skips the provider fallback chain.
Changes are applied on the next message (the team runner cache is invalidated).
Admin UI: **Chatbot Profile → Model & reasoning** sets chatbot defaults;
**Agents → Settings** and **Create Agent** set per-agent overrides. Migration:
`0042_agent_model_reasoning`.

The **routing leader** (the triage agent configuring the team, or Agno's own
leader when none exists) resolves the same way — triage override → chatbot
default → env — instead of being pinned off. The leader only uses chain-of-
thought when its override or the chatbot default sets `low`/`medium`/`high`,
and a triage `reasoning_effort` of `""` still pins routing reasoning off.

## 🧪 Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_api/test_agents.py

# Run with verbose output
pytest -v
```

## 📊 Database Models

### Core Models

1. **Agent**: AI agents with capabilities and configuration
2. **Workflow**: Orchestration definitions for multi-agent execution
3. **Task**: Individual agent execution tasks
4. **Document**: Documents with vector embeddings for RAG
5. **Execution**: Detailed execution history and logs
6. **Conversation**: Chat sessions and message history

### Vector Storage

Documents are stored with embeddings using pgvector:
- Efficient similarity search with cosine distance
- Automatic indexing with IVFFlat
- Support for multiple embedding models

## 🔄 Workflow Engine

The workflow engine supports multiple execution strategies:

### Sequential Execution
Agents execute one after another, passing results forward.

### Parallel Execution
Multiple agents execute simultaneously, results are aggregated.

### Conditional Execution
Agent selection based on previous results or conditions.

### Graph-based Execution
Complex workflows using LangGraph for state management.

## 🤖 Agent Types

- **Chat Agent**: Conversational AI for customer support
- **Task Agent**: Automated task execution
- **Analysis Agent**: Data analysis and insights
- **Orchestrator Agent**: Coordinates multiple agents
- **Custom Agent**: User-defined agent types

## 📥 Human Support Inbox Operations Console

The platform provides a dual-console **Human Support Inbox** system, allowing both Space Owners and dedicated support staff to handle escalated customer sessions.

### 1. Space Owner Operations Console (`SpaceInbox.tsx`)
Integrated directly into the authenticated Space Owner dashboard layout (route: `/inbox`), providing a premium unified support workspace with no extra login steps:
* **High-Fidelity Support Queue**: A left-hand sidebar displaying all customer sessions grouped into four premium, collapsible, glassmorphic categories:
  * **Waiting Claim** (amber): Escalated sessions waiting for attention.
  * **Active Claims** (indigo): Sessions currently claimed by support owners.
  * **Open Customer Chats** (emerald): Live chatbot-to-customer conversations.
  * **Resolved / Closed** (slate): Historical resolved chats.
* **Direct Session Claiming & Takeover**: Renders a glowing action banner for unassigned escalations or live open chatbot conversations, allowing the owner to instantly claim the session, take over the chat from AI, and transition it to active status.
* **Direct Real-time Replies**: Renders an interactive support chat input at the bottom of claimed sessions, letting the owner chat directly with the customer with smooth typing states.
* **Staff Member Delegation**: Allows owners to seamlessly transfer active customer sessions to dedicated online staff members using a premium transfer modal.
* **Staff Management**: An administrative panel to easily add, monitor active chat loads, and manage staff members with inline presence indicators.

### 2. Backwards-Compatible Dedicated Staff Console (`Inbox.tsx`)
A pristine, standalone read-only or session-scoped interface designed exclusively for dedicated staff members using staff JWT credentials. It runs completely separated from the space owner's admin views to prevent any administrative privilege escalation.
Make sure ui design is always responsive on all the screens.

---

## 📈 Monitoring & Logging

- Structured logging with structlog
- Prometheus metrics endpoint
- Request/response timing
- Error tracking and reporting
- Database query monitoring

## 🔒 Security

- API key authentication
- JWT token support
- CORS configuration
- Rate limiting
- Input validation with Pydantic
- SQL injection prevention with SQLAlchemy

## 🚢 Deployment

### Docker Deployment

```bash
# Build image
docker build -t fastapi-multi-agent .

# Run container
docker run -p 8000:8000 --env-file .env fastapi-multi-agent
```

### Docker Compose

```bash
docker-compose up -d
```

### Production Checklist

- [ ] Set strong SECRET_KEY
- [ ] Configure production database
- [ ] Set up SSL/TLS certificates
- [ ] Enable rate limiting
- [ ] Configure monitoring
- [ ] Set up log aggregation
- [ ] Configure backup strategy
- [ ] Set DEBUG=false
- [ ] Use environment-specific configs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## 🗄️ Database Schema

All tables live in a single PostgreSQL database. Migrations are in `alembic/versions/`.

---

### Core — Multi-tenancy

#### `spaces`
The top-level tenant. Every resource belongs to a space.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| slug | VARCHAR unique | URL-safe identifier, used in chatbot URLs |
| display_name | VARCHAR | Brand name |
| email | VARCHAR unique | Owner login email |
| password_hash | VARCHAR | bcrypt |
| logo_url | VARCHAR | Optional branding |
| theme_color | VARCHAR | Hex, used in customer chat widget |
| plan | VARCHAR | `free` / `pro` / `enterprise` |
| active | BOOLEAN | Soft-disable a space |
| show_rag_citations | BOOLEAN | Show source citations in chat |
| enabled_nav_items | TEXT | JSON array — per-space nav override |
| created_at / updated_at | TIMESTAMP | |

**Relations:** one-to-many with every other table.

---

### Chatbots

#### `chatbots`
A deployable chat widget. One space can have multiple chatbots (e.g. one per product line).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| name | VARCHAR | |
| slug | VARCHAR unique | Used in public URL `/chat/{slug}` |
| description | TEXT | |
| active | BOOLEAN | |
| greeting | TEXT | First message shown to customers |
| llm_model | VARCHAR(120) | Per-chatbot LLM override (`openai/gpt-4o-mini`). NULL = inherit env config |
| reasoning_effort | VARCHAR(20) | `''` (off) \| `low` \| `medium` \| `high`. NULL = inherit env config (off by default) |
| created_at / updated_at | TIMESTAMP | |

**Relations:** many-to-many with `custom_agents` via `chatbot_custom_agents`; one-to-many with `space_builtin_agent_configs`.

---

### Agents

#### `builtin_agent_catalog`
Platform-wide catalog of built-in agent types (Finance, Logistics, Order, etc). Managed by super admin.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| slug | VARCHAR unique | e.g. `finance`, `logistics` |
| name | VARCHAR | Display name |
| description | TEXT | |
| icon | VARCHAR | Emoji |
| agent_class | VARCHAR | Python class name to instantiate |
| base_prompt | TEXT | Hidden system guardrail, super-admin only |
| platform_enabled | BOOLEAN | Super admin toggle — gates all spaces |
| created_at / updated_at | TIMESTAMP | |

**Relations:** one-to-many with `space_builtin_agent_configs`.

#### `space_builtin_agent_configs`
Per-space toggle + customisation for each built-in agent type.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| chatbot_id | UUID FK → chatbots | |
| catalog_id | UUID FK → builtin_agent_catalog | |
| enabled | BOOLEAN | Space-level on/off |
| system_prompt | TEXT | Space-editable override |
| temperature | FLOAT | |
| max_tokens | INT | |
| llm_model | VARCHAR(120) | Per-agent LLM override. NULL = inherit chatbot default |
| reasoning_effort | VARCHAR(20) | `''` (off) \| `low` \| `medium` \| `high`. NULL = inherit chatbot default |

**Relations:** many-to-one with both `spaces` and `builtin_agent_catalog`.

#### `custom_agents`
User-created agents. Fully configurable — RAG, KB links, system prompt, routing keywords.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| slug | VARCHAR | Unique within space |
| name / description | VARCHAR / TEXT | |
| icon | VARCHAR | Emoji |
| system_prompt | TEXT | |
| temperature / max_tokens | FLOAT / INT | LLM params |
| rag_enabled | BOOLEAN | |
| rag_doc_types | VARCHAR | Comma-separated ChromaDB doc types to query |
| rag_top_k | INT | |
| keywords_json | TEXT | JSON array — fallback routing keywords |
| skills_json | TEXT | JSON array of PromptSkill IDs |
| active | BOOLEAN | |
| llm_model | VARCHAR(120) | Per-agent LLM override (`deepseek/deepseek-reasoner`). NULL = inherit chatbot default |
| reasoning_effort | VARCHAR(20) | `''` (off) \| `low` \| `medium` \| `high`. NULL = inherit chatbot default |
| created_at / updated_at | TIMESTAMP | |

**Relations:** many-to-many with `chatbots` via `chatbot_custom_agents`; one-to-many with `agent_knowledge_bases`.

#### `chatbot_custom_agents`
Junction table — which custom agents are active for which chatbot.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| chatbot_id | UUID FK → chatbots | |
| agent_id | UUID FK → custom_agents | |

---

### Knowledge Base

#### `knowledge_bases`
A named collection of documents/text/Q&A that agents can query via RAG.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| name / description | VARCHAR / TEXT | |
| created_at / updated_at | TIMESTAMP | |

**Relations:** one-to-many with `knowledge_base_items`; many-to-many with `custom_agents` via `agent_knowledge_bases`.

#### `knowledge_base_items`
Individual content items inside a KB.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| kb_id | UUID FK → knowledge_bases | |
| item_type | VARCHAR | `doc` / `text` / `qna` |
| doc_id | VARCHAR | ChromaDB document ID (for `doc` items) |
| question | TEXT | Q&A question |
| content | TEXT | Answer or body text |
| indexed_doc_id | VARCHAR | ChromaDB ID for indexed text/qna |
| created_at / updated_at | TIMESTAMP | |

#### `agent_knowledge_bases`
Junction table — which KBs are linked to which custom agent.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| agent_id | UUID FK → custom_agents | |
| kb_id | UUID FK → knowledge_bases | |
| UNIQUE(agent_id, kb_id) | | Prevents duplicates |

---

### Conversations

#### `chat_sessions`
One row per customer conversation thread.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Also used as `session_id` in all APIs |
| space_id | UUID FK → spaces | |
| chatbot_id | UUID FK → chatbots | |
| title | VARCHAR | Derived from first message |
| agent_slug | VARCHAR | Last agent that handled a message |
| status | VARCHAR | `open` / `escalated` / `queued` / `active` / `closed` |
| ai_disabled | BOOLEAN | True after human handoff — AI stops responding |
| escalated_at | TIMESTAMP | When customer requested human |
| escalation_reason | VARCHAR | `customer_request` / `agent_failed` / `sentiment` |
| assigned_staff_id | UUID FK → staff_members | Current human agent |
| claimed_at | TIMESTAMP | When staff claimed the session |
| resolved_at | TIMESTAMP | When staff resolved the session |
| message_count | INT | |
| started_at / last_message_at | TIMESTAMP | |

**Relations:** many-to-one with `spaces` and `chatbots`; one-to-many with `conversation_logs`.

#### `conversation_logs`
Every message turn — customer, AI, and human agent.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| chatbot_id | UUID FK → chatbots | Nullable |
| session_id | VARCHAR | References `chat_sessions.id` as string |
| role | VARCHAR | `user` / `assistant` / `human_agent` |
| message | TEXT | Full message content |
| intent | VARCHAR | Classified intent |
| agent_slug | VARCHAR | Which agent replied |
| rag_hit | BOOLEAN | Whether RAG was used |
| sentiment_score | FLOAT | Optional sentiment |
| response_ms | INT | Latency for assistant turns |
| timestamp | TIMESTAMP | |

---

### Human Inbox

#### `staff_members`
Human agents who handle escalated chat sessions. Separate auth (staff JWT) from space owners.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| email / name | VARCHAR | Login credentials |
| password_hash | TEXT | bcrypt |
| description | TEXT | Used by LLM assignment to pick best staff |
| presence | VARCHAR | `online` / `offline` |
| service_paused | BOOLEAN | Online but not accepting new chats |
| max_concurrent_chats | INT | Capacity limit |
| active_chat_count | INT | Current load |
| service_hours_start/end | VARCHAR | `HH:MM` — overnight-safe |
| timezone | VARCHAR | IANA tz string |
| active | BOOLEAN | Soft-delete |
| last_seen_at | TIMESTAMP | Updated by heartbeat every 30s |

#### `session_waiting_queue`
Sessions waiting for a human agent. Drained when staff come online or finish a session.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| session_id | UUID FK → chat_sessions | Unique — one queue slot per session |
| status | VARCHAR | `waiting` / `assigned` / `expired` |
| priority | INT | Higher = served first |
| position | INT | Insertion order within same priority |
| escalation_reason | VARCHAR | |
| last_customer_message | TEXT | Shown to staff when claiming |
| queued_at | TIMESTAMP | |
| expires_at | TIMESTAMP | Set from `space_assignment_rules.queue_wait_timeout_minutes` |
| assigned_at | TIMESTAMP | When a staff member was found |

#### `session_assignment_history`
Audit log of every assignment/release event. Used by history-priority staff selection.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK → chat_sessions | |
| staff_id | UUID FK → staff_members | |
| space_id | UUID | Denormalised for fast space queries |
| action | VARCHAR | `assigned` / `released` / `transferred` |
| source | VARCHAR | `rule` / `manual` / `transfer` / `ai_escalation` |
| assigned_at | TIMESTAMP | |
| released_at | TIMESTAMP | Null until released |

#### `space_assignment_rules`
Per-space configuration for the inbox system.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | Unique — one config per space |
| llm_assignment_enabled | BOOLEAN | Use LLM to pick best staff member |
| queue_wait_timeout_minutes | INT | Default 30 — after this, queue entry expires |
| notification_email | VARCHAR | Email to alert when queue builds up |

---

### Prompt Skills

#### `prompt_skills`
Reusable prompt fragments that can be attached to custom agents.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| name / description | VARCHAR / TEXT | |
| skill_type | VARCHAR | `instruction` / `context` / `format` / `rag_filter` |
| prompt_text | TEXT | The actual prompt fragment |
| active | BOOLEAN | |

**Mapping:** IDs stored as JSON array in `custom_agents.skills_json`. Resolved at runtime by `DynamicAgentExecutor`.

---

### Data Sources

The current runtime uses a tool registry rather than binding one API directly
to an agent type. Management endpoints are available under
`/api/v1/data-sources` and separate:

- `data_source_connections`: base URL and encrypted authentication secret;
- `data_source_tools`: one read-only REST operation and its JSON schemas;
- `agent_tool_assignments`: chatbot-specific built-in/custom agent access;
- `data_source_test_runs`: sanitized activation diagnostics.

Tools remain drafts until their current revision passes an execution test.
Production runners receive only tools assigned to the selected active agent;
configuration changes invalidate the affected chatbot runner. Phase 1 permits
`GET` and explicitly read-classified lookup `POST` operations.

The add-data-source screen can prefill a reviewable draft from a cURL command
or an OpenAPI 3 JSON/YAML document. Import and response analysis are
non-persisting: deterministic parsing runs first, optional AI suggestions are
accepted only when they reference observed response fields, and users still
review the connection, operation, mapping, and active target agent. Imported
credentials are discarded; secrets must be re-entered in the password field
and are never included in draft or analysis responses. The temporary
`/import`, `/analyze`, and `/test` endpoints do not create registry rows;
activation continues through the persisted test-and-activate lifecycle.

The guided screen moves through Import, Connection, Tool Review, Agent
Assignment, and Test & Activate. OpenAPI documents with multiple supported
operations show an operation selector. Advanced schema/template JSON stays
collapsed by default, AI mappings require explicit confirmation, and any edit
after a temporary successful test invalidates that result. Only an active,
non-triage agent belonging to the selected chatbot can be assigned.

Outbound URL checks reject private/mixed DNS answers and revalidate redirects.
Production must additionally block private, loopback, link-local, and metadata
destinations at the firewall or outbound proxy because HTTPX cannot pin a
validated DNS answer while preserving hostname/TLS behavior through its public
API. Apply and verify the environment-specific checklist in
[`docs/deployment/datasource-egress.md`](docs/deployment/datasource-egress.md)
before enabling tenant-configured tools in production.

#### `space_data_sources`
External API connectors for live data (e.g. order status, CRM lookups).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| name | VARCHAR | |
| agent_type | VARCHAR | Which agent type uses this source |
| api_url | VARCHAR | Endpoint URL |
| method | VARCHAR | `GET` / `POST` / `PUT` / `PATCH` |
| auth_type | VARCHAR | `none` / `bearer` / `api_key` / `basic` |
| auth_value | TEXT | Token/key (stored encrypted at rest) |
| auth_header | VARCHAR | Default: `Authorization` |
| request_headers_json | TEXT | JSON — extra headers |
| request_params_json | TEXT | JSON — query params |
| request_body_json | TEXT | JSON — request body template |
| field_mapping_json | TEXT | JSON — response field mappings |
| sample_response | TEXT | Used for agent prompt context |
| active | BOOLEAN | |

---

### Platform

#### `platform_settings`
Single-row global config managed by super admin. Existing menu items are stored in the `platform_settings` table, and the default value is:
```json
{"dashboard":true,"chat":true,"agents":true,"knowledge-base":true,"analytics":true,"data-sources":true,"settings":true,"inbox":true}
```

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| nav_config | TEXT | JSON dict — which nav items are enabled platform-wide |
| created_at | TIMESTAMP | |

#### `agent_meta_suggestions`
LLM-generated agent config suggestions, cached per space + doc_types combo.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | |
| doc_types | TEXT | Comma-separated — cache key |
| agent_id | UUID FK → custom_agents | Linked after user creates the agent |
| name / description / icon | VARCHAR | LLM-generated |
| system_prompt | TEXT | LLM-generated |
| suggested_keywords | TEXT | JSON array |
| created_at | TIMESTAMP | |

---

### Workflow Engine & Vector RAG

#### `documents`
Stores document chunks with vector embeddings for similarity search using pgvector.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| space_id | UUID FK → spaces | Nullable |
| content | TEXT | Chunk body |
| doc_metadata | JSON | Metadata dict |
| embedding | VECTOR(384) | pgvector embedding |
| source | VARCHAR | Document origin path or url |
| chunk_index | INT | Chunk sequence number |
| parent_document_id | UUID | Parent doc reference |
| document_type | VARCHAR | e.g. `text` |
| language | VARCHAR | Default: `en` |
| created_at / updated_at | TIMESTAMP | |

**Index:** HNSW or IVFFlat index on `embedding` using cosine distance.

#### `agents`
Core operational agents configured in the system.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR | Unique identifier |
| type | VARCHAR | `chat` / `task` / `analysis` / `orchestrator` / `custom` |
| description | TEXT | |
| capabilities | JSON | Capabilities array |
| configuration | JSON | Config key-values |
| status | VARCHAR | `active` / `inactive` / `maintenance` / `error` |
| version | VARCHAR | default `1.0.0` |
| llm_model | VARCHAR | LLM name (e.g. `gpt-4o`) |
| temperature | VARCHAR | |
| max_tokens | VARCHAR | |
| system_prompt | TEXT | |
| created_at / updated_at | TIMESTAMP | |

#### `workflows`
Orchestration definitions mapping multi-agent pipeline steps.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR | |
| description | TEXT | |
| execution_type | VARCHAR | `sequential` / `parallel` / `conditional` / `graph` |
| steps | JSON | Array defining steps, agent IDs, and connections |
| configuration | JSON | |
| status | VARCHAR | `draft` / `active` / `paused` / `archived` |
| version | VARCHAR | |
| tags | JSON | |
| timeout | VARCHAR | default `600` |
| retry_policy | JSON | |
| created_by | VARCHAR | |
| created_at / updated_at | TIMESTAMP | |

#### `tasks`
Execution instances of individual agents within a workflow or standalone.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| workflow_id | UUID FK → workflows | Nullable (if standalone) |
| agent_id | UUID FK → agents | |
| name | VARCHAR | |
| description | TEXT | |
| input_data | JSON | |
| output_data | JSON | |
| error_message | TEXT | |
| error_traceback | TEXT | |
| status | VARCHAR | `pending` / `running` / `completed` / `failed` / `cancelled` / `timeout` |
| priority | INT | |
| retry_count | INT | |
| max_retries | INT | |
| timeout | INT | default `300` |
| metadata | JSON | |
| started_at / completed_at | TIMESTAMP | |

#### `executions`
Detailed history of executions for workflows, tasks, or standalone agents.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| workflow_id | UUID FK → workflows | |
| task_id | UUID FK → tasks | |
| agent_id | UUID FK → agents | |
| execution_type | VARCHAR | `workflow` / `task` / `agent` |
| input_data / output_data | JSON | |
| error / error_traceback | TEXT | |
| duration | FLOAT | Seconds |
| status | VARCHAR | `started` / `running` / `completed` / `failed` / `cancelled` |
| metadata | JSON | |
| logs | JSON | Execution logs list |
| metrics | JSON | performance metrics |
| created_at / completed_at | TIMESTAMP | |

#### `conversations`
Chat sessions between users and agents in the generic system.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| title | VARCHAR | |
| agent_id | UUID FK → agents | |
| user_id | VARCHAR | |
| metadata | JSON | |
| message_count | INT | |
| created_at / updated_at | TIMESTAMP | |

#### `messages`
Individual message logs belonging to a conversation.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| conversation_id | UUID FK → conversations | |
| role | VARCHAR | `user` / `assistant` / `system` |
| content | TEXT | |
| metadata | JSON | |
| tokens | INT | token count |
| model | VARCHAR | LLM name |
| created_at | TIMESTAMP | |

---

## 🗺️ Table Relationship Map

```
spaces
├── chatbots
│   ├── space_builtin_agent_configs ──→ builtin_agent_catalog
│   └── chatbot_custom_agents ──→ custom_agents
│                                       └── agent_knowledge_bases ──→ knowledge_bases
│                                                                       └── knowledge_base_items
├── custom_agents
├── prompt_skills
├── conversation_logs
├── chat_sessions
│   ├── session_waiting_queue
│   └── session_assignment_history ──→ staff_members
├── staff_members
├── space_assignment_rules
├── space_data_sources
├── knowledge_bases
└── agent_meta_suggestions

workflows
├── tasks
│   └── executions ──→ agents
└── executions ──→ agents

conversations
└── messages

documents (pgvector chunks scoped to spaces or global)

platform_settings  (global singleton)
builtin_agent_catalog  (global, super-admin managed)
```

---

## Docker

# Postgres logs
docker logs deploy-postgres-1

# API logs
docker logs deploy-api-1

# Follow live logs (ctrl+c to stop)
docker logs -f deploy-api-1

# Last 50 lines only
docker logs --tail 50 deploy-postgres-1



___


## 📝 License

MIT License - see LICENSE file for details

## 📧 Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: [docs-url]
- Email: support@example.com

## 🙏 Acknowledgments

- FastAPI framework
- LangChain/LangGraph for agent orchestration
- pgvector for vector storage
- SQLAlchemy for ORM
- All contributors and maintainers

---

## Details

Support247

Support247 is an AI-powered customer support platform that automatically handles customer queries — around the clock, without human intervention.



Web App: support247.chat

What It Does

When a customer reaches out, Support247 instantly understands what they need and resolves it — whether that's tracking an order, answering a product question, or explaining a refund policy. No wait times. No offline hours. No manual effort.

Your Instant Support Endpoint

The moment you sign up, your dedicated support URL is live:



support247.chat/acme ← if your store is acme.com

support247.chat/yourstore ← yours, instantly

Share it. Embed it. Connect it. It's ready in 5 seconds.

Deploy Anywhere

ChannelHowDedicated URLsupport247.chat/acme — shareable, standalone chatbot pageYour WebsiteEmbed as a chat widget with one line of codeWhatsAppConnect your WhatsApp Business number — same bot, zero extra setupInstagram DMsAuto-reply to customer messages directlyFacebook MessengerPlug in via integration — live instantlyCustomization

Brand colors, logo, and chat bubble style

Custom greeting and bot name

Language and tone settings

Response style — formal, friendly, or casual

Restricted topics — define what the bot will and won't answer

Visual Themes

1. Clean & High-Tech

For tech brands, SaaS tools, and modern e-commerce.



Minimal glassmorphism UI — frosted panels, soft blue and teal gradients, smooth micro-animations on every response. The interface feels like it's thinking. Sharp, precise, intelligent. Every interaction reinforces that this is AI — not just a chatbot.

Palette: #0EA5E9 · #06B6D4 · #F0F9FF · frosted white glassFeel: Calm. Precise. Cutting-edge.

2. Energetic & Accessible

For small businesses, local stores, student communities.



Bold colors, friendly rounded chat bubbles, and a fast lo-fi aesthetic. Feels like texting a knowledgeable friend. The "5-second setup" doesn't just sound easy — the UI proves it. Big buttons, clear steps, zero intimidation.

Palette: #F97316 · #FACC15 · #4ADE80 · warm whiteFeel: Fast. Friendly. Anyone can use this.

3. Industrial & Reliable

For logistics companies, enterprises, and 24/7 operations.



Dark mode-first design. High-contrast white text on deep charcoal backgrounds. Glowing teal and electric blue accents pulse subtly — like a system that never sleeps. Every screen communicates uptime, stability, and trust.

Palette: #0F172A · #1E293B · #38BDF8 glow · #FFFFFFFeel: Always on. Rock solid. Built for scale.

Core Features

Always-On Availability

Customers get instant responses 24/7 — no hold music, no "we'll get back to you."

Live Shipment Tracking

Real-time logistics updates pulled from carriers (FedEx, UPS, USPS, DHL) the moment a customer asks.

Product Intelligence

Answers product questions — specs, availability, comparisons — directly from your catalog.

Policy Automation

Reads and applies your refund, warranty, and compensation policies automatically. Every decision is auditable.

Smart Triage

Detects customer tone and urgency. High-frustration cases are flagged and prioritized instantly.

5-Second Setup

Connect Support247 to your store in seconds. No complex integration. No engineering required.

See It In Action

1. Order Tracking

Chatbox on support247.chat/acme



Customer: Where is my order?

Support247: Could you share your order ID so I can pull that up?

Customer: #ORD-84920

Support247: Your order #ORD-84920 was dispatched via FedEx on May 29th.

Currently in transit at the Chicago sorting facility — arriving June 2nd.

Track it live here → [link]

Customer: Why is it delayed?

Support247: A 1-day delay at the Chicago hub due to high seasonal volume.

Your package is back on schedule with no further disruptions expected.

2. Refunds & Returns

Chatbox on support247.chat/acme



Customer: My product stopped working after 2 days. I want a refund.

Support247: Your order is within our 30-day return window and covers

manufacturing defects — you're fully eligible. Refund or replacement?

Customer: Refund.

Support247: Done. $49.99 initiated. Reflects in 3–5 business days.

Confirmation email on its way.

3. Any Doc, Any Use Case

Drop a doc. Go live instantly.

Example: College Event Bot → support247.chat/studentunion

A student union uploads their event schedule and FAQ. Instantly:



Student: Is the auditorium free Friday evening?

Bot: Yes — Main Auditorium is free 5 PM–10 PM Friday.

Booking requires 48 hours advance notice via the student portal.

No code. No developer. Upload a doc — bot is live in 5 seconds.

The Result

BeforeAfterCustomers wait hoursResolved in secondsAgents handle repetitive queriesAgents focus on complex casesPolicies misapplied manuallyPolicies enforced automaticallySupport offline after hoursAlways on across every channelCustom bots need developersUpload a doc — go live instantlyOne channel onlyWebsite + WhatsApp + Social, unifiedGeneric lookFully themed to your brand"Action over Conversation." — support247.chat/yourstore 



Built with ❤️ using FastAPI, PostgreSQL, and modern AI technologies.

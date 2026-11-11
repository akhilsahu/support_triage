# Database-agent runtime (`app/agents`)

- `resolved_agent.py` converts database-defined agents into runtime configuration used by customer chat, Orchestra and datasource services.
- Agno is the only executor. `ORCHESTRATOR` accepts only `agno`; obsolete values fail settings validation.

The database-agent orchestration implementation lives in [app/orchestra/ai](../orchestra/ai/). Aura chat uses shared evidence preparation in `app/orchestra/ai/knowledge/retrieval/retrieve_chunks.py` with injected Yullo source/entity policies and conversation persistence in `app/yullo/adapters/conversations.py`; shared execution lives in `app/orchestra/ai/inference/`.

Shared AI-to-UI contracts live in `app/orchestra/ai/ui_render/`: `entity_cards.py` validates selections from authorized data-only records; `render_tools.py` provides customer-chat table/card/tab tools. Yullo entity eligibility and public-field projection remain in `app/yullo/services/entities/{service,payloads}.py`. Frontend components render the resulting payloads.

## Unused-agent cleanup — 2026-11-09

Removed the unused `tech_support_agent.py`, then retired the legacy/demo flows with explicit owner approval:

- Deleted the legacy finance, logistics, support, order, triage and empathy implementations and their `app/api/chat.py` router.
- Deleted their orphaned mock inventory, mock shipping and legacy policy RAG services. Shared CRM, LLM and vector-store services remain in use.
- Removed the orphaned demo user fixture/export; retained product fixtures used by shared catalog seeding.
- Removed `/api/v1/chat`, `/api/v1/agents/status`, `/api/v1/empathy/analyze` and `/api/v1/documents/rag/client/{client_id}`, along with their frontend API helpers.
- Deleted the demo Chat screen; `/app/chat` now redirects to the existing database-agent test screen at `/app/agents/test`. Dashboard and alternate-layout links go directly there.
- Preserved database-backed customer chat, Yullo Aura, document ingestion/review and the separate `/api/v1/documents/rag/chat` endpoint. No database records or migrations changed.

The owner subsequently approved retiring `dynamic_executor.py`. Removed its factory fallback, dynamic-only demo script and standalone memory wrapper. Agno's executor, tools, native streaming and memory integration remain; `resolved_agent.py` is retained.

Verification and pending runtime checks are recorded in the [production chat plan](../../docs/superpowers/plans/2026-08-29-production-chat-foundation.md).

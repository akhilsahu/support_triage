# Product Loops & AI Cost Observability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-selected features (CSAT, escalation brief in Inbox, business-hours-aware chat, canned/KB-suggested agent replies, KB health score) and engineering upgrades (per-call AI usage/cost tracking linked to chat/message/KB, SSE resume, Celery background work) — closing the product loops identified in the 2026-09-04 analysis.

**Architecture:** All AI calls funnel through `LLMService.generate()` and the Chroma embedding function — those are the two instrumentation points. Attribution travels via a `ContextVar` set by request handlers (chat, ingestion, evaluations), so call sites stay unchanged. Usage rows are written fail-open in an independent transaction (same pattern as `record_conversation_event`). SSE resume uses monotonic event ids + persisted-transcript replay on `Last-Event-ID`.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, sse-starlette, Agno, React 18 + Vite + Zustand.

**Spec:** 2026-09-04 analysis conversation; user selections: features 1–5 (skip auto-eval-cases), cost observability ("db tables linked to chat id response id and also knowledge base level at every level ai is used"), SSE resilience, Celery background work; vector-store consolidation dropped (pgvector already retired per user).

## Global Constraints

- New migrations start at **0054** — the working stash holds untracked 0051–0053 (`platform_integrations`, `whatsapp_integration`, `whatsapp_events_usage`); numbering below that would collide on `git stash pop`.
- Every AI usage write is **fail-open**: a recording failure must never break the user-facing call.
- Usage attribution uses nullable columns — system-level calls (no space) record with NULLs, never dropped.
- watsonx usage is **estimated** (chars/4) and flagged `estimated=true`; OpenAI/Anthropic report real token counts.
- Unit tests run without Postgres/Redis: `pytest tests/unit -q -o addopts=""` (227 passing baseline).
- Each phase lands as independent commits; a phase must leave the suite green.
- Later phases (P3–P7) carry concrete specs and are expanded in-place with full TDD steps immediately before execution.

---
## Phase 1 — AI usage & cost observability (execute first)

**Files:**
- Create: `alembic/versions/0054_ai_usage_events.py`
- Create: `app/models/ai_usage.py`
- Create: `app/services/ai_usage.py` (recorder)
- Create: `app/services/ai_usage_context.py` (ContextVar)
- Modify: `app/services/llm_service.py` (instrument `generate`)
- Modify: `app/orchestra/ai/embedding/service.py` (instrument embedding fn)
- Modify: `app/models/__init__.py` (export)
- Create: `app/api/v1/usage.py` + mount in `app/main.py`
- Test: `tests/unit/services/test_ai_usage.py`

### Task 1.1: Migration + model

- [ ] **Step 1: Create migration `0054_ai_usage_events.py`** (down_revision = `0050_datasource_feature_control`)

```python
"""ai_usage_events — per-call AI usage/cost tracking

Every LLM/embedding/rerank call records one row: who paid (space), what for
(kind + linkage), which model, how many tokens, estimated cost.

Revision ID: 0054_ai_usage_events
Revises: 0050_datasource_feature_control
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0054_ai_usage_events"
down_revision = "0050_datasource_feature_control"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("space_id", UUID(as_uuid=True),
                  sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("chatbot_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("kb_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("session_id", UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("message_id", UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False, index=True),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("prompt_tokens", sa.Integer, nullable=True),
        sa.Column("completion_tokens", sa.Integer, nullable=True),
        sa.Column("total_tokens", sa.Integer, nullable=True),
        sa.Column("estimated", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("ok", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("error_type", sa.String(120), nullable=True),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False, index=True),
    )
    op.create_index("ix_ai_usage_space_created", "ai_usage_events", ["space_id", "created_at"])


def downgrade() -> None:
    op.drop_table("ai_usage_events")
```

- [ ] **Step 2: Create `app/models/ai_usage.py`** — SQLAlchemy mirror of the table above (columns identical; `Base` from `app.core.database`), and export it from `app/models/__init__.py`.

- [ ] **Step 3: Verify migration chain** — Run: `ls alembic/versions | grep 0054` and confirm `down_revision` matches `0050_datasource_feature_control`'s revision id (check that file's `revision` string).

- [ ] **Step 4: Commit** — `git add alembic/versions/0054_ai_usage_events.py app/models/ai_usage.py app/models/__init__.py && git commit -m "feat(usage): ai_usage_events table + model"`

### Task 1.2: Attribution context + fail-open recorder

- [ ] **Step 1: Create `app/services/ai_usage_context.py`**

```python
"""Request-scoped AI attribution. Handlers set it; llm_service/embeddings read it.

Set in customer.py (chat), documents/ingestion tasks (kb_id), evaluations runner.
Never raises — missing context just means NULL attribution columns.
"""
from contextvars import ContextVar
from typing import Optional
from uuid import UUID
from dataclasses import dataclass


@dataclass
class AiUsageContext:
    space_id: Optional[UUID] = None
    chatbot_id: Optional[UUID] = None
    kb_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    message_id: Optional[UUID] = None


_current: ContextVar[Optional[AiUsageContext]] = ContextVar("ai_usage_ctx", default=None)


def set_ai_usage_context(ctx: AiUsageContext) -> object:
    """Set the context; returns the token for reset()."""
    return _current.set(ctx)


def reset_ai_usage_context(token: object) -> None:
    _current.reset(token)


def get_ai_usage_context() -> AiUsageContext:
    return _current.get() or AiUsageContext()
```

- [ ] **Step 2: Write failing test `tests/unit/services/test_ai_usage.py`**

```python
"""Recorder + usage-extraction tests. No DB: recorder runs against a stubbed session."""
import pytest

from app.services.ai_usage import build_usage_event, extract_openai_usage, estimate_tokens


class _FakeResult:
    def __init__(self, row): self._row = row
    def scalar_one_or_none(self): return self._row


async def test_extract_openai_usage_real_tokens():
    usage = extract_openai_usage({"prompt_tokens": 11, "completion_tokens": 7},
                                 provider="openai", model="gpt-4o-mini", latency_ms=120)
    assert usage["prompt_tokens"] == 11 and usage["completion_tokens"] == 7
    assert usage["total_tokens"] == 18 and usage["estimated"] is False


def test_estimate_tokens_chars_over_four():
    assert estimate_tokens("x" * 40) == 10


async def test_build_usage_event_defaults_fail_closed_to_ok_row():
    ev = build_usage_event(kind="chat", provider="openai", model="gpt-4o-mini",
                           latency_ms=100, usage={"prompt_tokens": 3, "completion_tokens": 2},
                           estimated=False)
    assert ev.kind == "chat" and ev.ok is True and ev.total_tokens == 5
```

- [ ] **Step 3: Run** — `.venv/bin/python -m pytest tests/unit/services/test_ai_usage.py -q -o addopts=""` → FAIL (module missing).

- [ ] **Step 4: Create `app/services/ai_usage.py`**

```python
"""Fail-open AI usage recorder. Mirrors app/services/conversation_events.py style."""
import time
from typing import Any, Dict, Optional
import structlog
from app.models.ai_usage import AiUsageEvent
from app.services.ai_usage_context import get_ai_usage_context

logger = structlog.get_logger()

# Rough estimator when a provider reports no usage (watsonx plain-text API).
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // CHARS_PER_TOKEN)


def extract_openai_usage(usage: Optional[Dict[str, Any]], *, provider: str, model: str,
                         latency_ms: int) -> Dict[str, Any]:
    """Normalize provider usage dicts into event columns."""
    if not usage:
        return {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None,
                "estimated": False}
    p = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
    c = usage.get("completion_tokens") or usage.get("output_tokens") or 0
    return {"prompt_tokens": int(p), "completion_tokens": int(c),
            "total_tokens": int(usage.get("total_tokens") or (p + c)), "estimated": False}


def build_usage_event(*, kind: str, provider: str, model: str, latency_ms: int,
                      usage: Optional[Dict[str, Any]] = None, estimated: bool = False,
                      ok: bool = True, error_type: Optional[str] = None,
                      meta: Optional[Dict[str, Any]] = None) -> AiUsageEvent:
    ctx = get_ai_usage_context()
    cols = {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None}
    if usage:
        p = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
        c = usage.get("completion_tokens") or usage.get("output_tokens") or 0
        cols = {"prompt_tokens": int(p), "completion_tokens": int(c),
                "total_tokens": int(usage.get("total_tokens") or (p + c))}
    return AiUsageEvent(
        space_id=ctx.space_id, chatbot_id=ctx.chatbot_id, kb_id=ctx.kb_id,
        session_id=ctx.session_id, message_id=ctx.message_id,
        kind=kind, provider=provider, model=model,
        prompt_tokens=cols["prompt_tokens"], completion_tokens=cols["completion_tokens"],
        total_tokens=cols["total_tokens"], estimated=estimated, cost_usd=None,
        latency_ms=latency_ms, ok=ok, error_type=error_type, meta=meta,
    )


async def record_usage_event(event: AiUsageEvent) -> None:
    """Independent transaction; failures are logged, never raised."""
    from app.core.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            db.add(event)
            await db.commit()
    except Exception as e:
        logger.warning("ai_usage.record_failed", error=str(e), kind=event.kind,
                       model=event.model)
```

- [ ] **Step 5: Run** → PASS. **Step 6: Commit** — `feat(usage): contextvar attribution + fail-open recorder`

### Task 1.3: Instrument `LLMService.generate()` (every LLM call, all callers)

- [ ] **Step 1:** In `app/services/llm_service.py`, wrap the provider dispatch inside `generate()` — measure latency, extract usage, record fail-open. Insert after the provider result is obtained and before `return`:

```python
        # ── AI usage tracking (fail-open; never affects the reply) ──────────
        try:
            from app.services.ai_usage import build_usage_event, record_usage_event
            latency_ms = int((time.monotonic() - _t0) * 1000)
            raw_usage = getattr(result.get("usage"), "model_dump", lambda: result.get("usage"))() \
                if result.get("usage") is not None else None
            estimated = False
            if not raw_usage and provider is LLMProvider.WATSONX:
                # watsonx generate_text returns plain text — estimate both sides.
                prompt_text = "".join(m.get("content", "") for m in messages) \
                    + (system_prompt or "")
                raw_usage = {"prompt_tokens": len(prompt_text) // 4,
                             "completion_tokens": len(result.get("content") or "") // 4}
                estimated = True
            ev = build_usage_event(kind="chat", provider=result.get("provider", provider.value),
                                   model=result.get("model", model), latency_ms=latency_ms,
                                   usage=raw_usage, estimated=estimated)
            import asyncio
            asyncio.get_running_loop().create_task(record_usage_event(ev))
        except Exception as e:  # pragma: no cover — tracking must never break chat
            logger.warning("llm_service.usage_track_failed", error=str(e))
```

Also add `_t0 = time.monotonic()` at the top of `generate()` and `import time` if absent. On the error path (provider exception), record a row with `ok=False, error_type=type(exc).__name__` the same way.

- [ ] **Step 2: Verify no behavior change** — Run: `.venv/bin/python -m pytest tests/unit -q -o addopts=""` → 227+ passed (usage writes go through `AsyncSessionLocal` which is only touched when a DB is up; the create_task wrapper is guarded by try/except).

### Task 1.4: Instrument embeddings (KB-level cost)

- [ ] **Step 1:** In `app/orchestra/ai/embedding/service.py`, wrap the function returned by `build_chroma_embedding_function(cfg)`: count requests + `estimate_tokens(sum of input texts)` per batch, then `create_task(record_usage_event(build_usage_event(kind="embedding", provider=cfg.provider, model=cfg.model, ...)))`. Preserve the original return value exactly (Chroma relies on the vectors).

### Task 1.5: Set attribution context at call sites

- [ ] **Step 1:** `app/api/customer.py` — in both the non-streaming and streaming paths, right after `_get_brand(...)` resolves, set the context (token stored; reset in `finally`):

```python
from app.services.ai_usage_context import AiUsageContext, set_ai_usage_context, reset_ai_usage_context
_token = set_ai_usage_context(AiUsageContext(
    space_id=org.id, chatbot_id=chatbot.id,
    session_id=uuid.UUID(session_id) if session_id else None,
    message_id=uuid.UUID(message_id) if message_id else None,
))
try:
    ...
finally:
    reset_ai_usage_context(_token)
```

- [ ] **Step 2:** Ingestion tasks (`app/orchestra/ai/ingestion/jobs/tasks.py`) — set `AiUsageContext(space_id=…, kb_id=…)` from the job row so embedding cost lands on the KB.

### Task 1.6: Aggregation API + dashboard

- [ ] **Step 1:** Create `app/api/v1/usage.py` — `GET /api/v1/usage/summary?days=30` (auth: `current_space`): grouped by `kind` and `model` — `SUM(total_tokens)`, `SUM(cost_usd)`, `COUNT(*)`, plus a daily timeseries. Registered in `app/main.py` with prefix `/api/v1`, tag `"AI Usage"`.
- [ ] **Step 2:** Dashboard widget: add an "AI Cost (30d)" card consuming the summary (total tokens + cost, top model row).
- [ ] **Step 3:** Run suite → green. **Commit:** `feat(usage): instrument llm/embedding calls + usage summary API + dashboard card`

---

## Phase 2 — SSE resilience (Last-Event-ID resume + heartbeat)

**Files:** Modify `app/api/customer.py` (streaming endpoint ~line 900-995); Test `tests/unit/api/test_sse_resume.py`

- [ ] **Step 1:** Emit monotonic `id` on every yield: change the generator to a counter `seq` and yield `{"id": str(seq), **event}` for `{"data": reply_text}`, `{"event": "reasoning", ...}`, and the final `{"event": "done"/...}` payload at line 974.
- [ ] **Step 2:** Accept `Last-Event-ID`: the endpoint reads the header (`request.headers.get("last-event-id")`); when present and a `session_id` is supplied, first replay persisted transcript events with `seq > last_id` from `ConversationLog`/`MessageLog` for that session (same org-scoped query pattern as `_get_brand`), tagged `{"event": "replay", ...}`, then continue live. Client sends it automatically on `EventSource` reconnect.
- [ ] **Step 3:** Heartbeat: pass `ping=15` explicitly to `EventSourceResponse(...)` (sse-starlette default; make it contractual) so proxies keep the connection open.
- [ ] **Step 4:** Test: unit-test the replay query helper (`_replay_events_after(session_id, last_seq, space_id)`) against a fake session — org-scoped, ordered, `seq > last_id`.
- [ ] **Step 5:** Frontend: `CustomerChat.tsx` — on `EventSource` `error`, browser auto-reconnects with Last-Event-ID; on replay events, append missing messages instead of duplicating (dedupe by message id).
- [ ] **Commit:** `feat(chat): SSE event ids, Last-Event-ID resume replay, explicit heartbeat`

---

## Phase 3 — CSAT micro-poll

**Files:** Migration `0056_csat.py` (add `chat_sessions.csat_rating SMALLINT NULL`, `csat_comment TEXT NULL`, `csat_at TIMESTAMPTZ NULL`); Modify `app/api/customer.py` (new endpoint after `submit_feedback`); Modify `ui/src/screens/CustomerChat.tsx`; Dashboard card.

- Endpoint: `POST /api/chat/{slug}/csat` — body `{session_id: str, rating: int(1..5), comment?: str}`; org-scoped update of `chat_sessions` (same `_get_brand` + UUID validation pattern as `submit_feedback`); returns 204 with `_CORS` headers; idempotent (last write wins).
- Conversation event: record `ConversationEventType` "csat" via `record_conversation_event` (fail-open) if the enum accepts it — check `app/orchestra/ai/contracts.py` first; if it's a strict Enum, extend it.
- UI: after the transfer/resolution state (or on session close banner), show a 1–5 star row + optional comment box; POST once.
- Dashboard: `AVG(csat_rating)` + response count per space, last 30d, next to the AI Cost card.

## Phase 4 — Escalation brief in Inbox

**Files:** Migration `0057_escalation_brief.py` (`chat_sessions.escalation_brief JSONB NULL`); Modify `app/services/inbox/transfer_service.py`, `app/api/customer.py::_maybe_escalate`, `app/api/v1/inbox/sessions.py`, `ui/src/screens/Inbox.tsx`.

- `transfer_to_staff(...)` gains `ai_brief: dict | None = None` → persisted to `session.escalation_brief` inside the existing locked-row block.
- `_maybe_escalate`: after `should_escalate` fires, fire-and-forget `run_escalation_workflow(...)` (summary/urgency/agent_brief per its own 3-step design) with `asyncio.create_task`; pass the resulting dict as `ai_brief`. Fail-open: workflow errors log `customer_chat.escalation_brief_failed` and proceed with `ai_brief=None`.
- Inbox sessions API: include `escalation_brief` in the session detail payload; `Inbox.tsx` renders a "AI handoff brief" card (summary, urgency badge, suggested approach) above the reply box when present.

## Phase 5 — Business-hours-aware chat

**Files:** Modify `app/api/customer.py::_maybe_escalate` (or the transfer branch), reuse `app/services/inbox/service_hours.py`.

- When escalation fires **outside** service hours (`is_within_service_hours(...)` False — it already returns True when unconfigured): reply uses the space's `no_staff_message` tone ("We're currently closed…"), the session is queued (`transfer_to_staff` unchanged — queue already holds it), and `email_notify` sends the owner a missed-contact notice if `SpaceAssignmentRule.notification_email` is set.
- No new tables; add `meta={"after_hours": true}` to the conversation event.

## Phase 6 — Canned + KB-suggested replies

**Files:** Create `app/api/v1/inbox/suggest_reply.py` (or extend `sessions.py`); Modify `ui/src/screens/Inbox.tsx`.

- `POST /api/v1/inbox/sessions/{session_id}/suggest-reply` (staff auth): pulls the last N customer messages + KB retrieval (top 3 chunks) → one `LLMService.generate` call → `{reply}`; usage-tracked (`kind="suggestion"`); staff-scoped so an agent can only suggest within their assigned sessions.
- Frontend: "Canned replies" dropdown (static starter set: greeting, refund-policy pointer, escalation ack, closing) + "✨ Suggest reply" button that fills the composer with the AI draft for editing before sending. **Never auto-send.**

## Phase 7 — KB health score (no eval cases)

**Files:** Create `app/api/v1/kb_health.py`; Modify `ui/src/screens/KnowledgeBase.tsx` (header card).

- `GET /api/v1/chatbots/{chatbot_id}/kb-health` (owner auth): returns
  - `answer_rate`: % of last-30d customer messages whose answer event had `rag_hit=true` (from `conversation_events`);
  - `top_gaps`: up to 10 most recent customer messages with `rag_hit=false`, lightly deduped by normalized text (no clustering jargon in UI — "Questions we couldn't answer");
  - `stale_docs`: KB docs not cited in any answer in 30d;
  - `health_score`: 0–100 blend (answer_rate weighted 70, freshness 30) with plain-language label ("Healthy / Needs attention / At risk").
- UI: card on KnowledgeBase screen: score, label, the gaps list with "Add answer to KB" linking into the KB editor (no evaluation machinery).

---

## Execution order & notes

P1 → P2 → P3 → P4 → P5 → P6 → P7. P1 is the foundation (later phases' AI calls are usage-tracked automatically). P5 depends on P4's `_maybe_escalate` rework. Each phase: implement → `pytest tests/unit -q -o addopts=""` green → targeted verify → commit. Celery background-work migration (ingestion jobs → worker queue) is deferred to its own plan after these phases: the in-process jobs + boot sweeper remain correct until then.





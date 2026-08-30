# Production Chat Foundation Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a test and review gate after each task.

**Goal:** Establish a typed production-chat execution contract, centralize customer executor construction, and persist the first durable conversation events without changing the public chat response format.

**Architecture:** Keep HTTP, authentication, and database lookup responsibilities in `app/api/customer.py`. Move executor construction into a focused production runtime module that consumes already-resolved tenant data. Add an append-only `conversation_events` table and a small recorder service; endpoint integration records lifecycle events but never makes chat availability depend on analytics persistence.

**Tech Stack:** Python 3.11, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, pytest.

**Spec:** `implementation.md`, sections 5.1-5.3.

## Global Constraints

- Preserve strict `space_id` and `chatbot_id` isolation.
- Preserve the existing `/api/chat/{slug}` and `/api/chat/{slug}/stream` response contracts.
- Keep `/api/v1/chat` as an explicitly documented legacy/demo API; do not route production traffic through it.
- Event persistence must fail open so analytics outages do not break customer chat.
- Do not persist reasoning text, secrets, raw authorization headers, or unredacted tool inputs in event payloads.
- Use `space`, not `org`, in new identifiers and documentation.

---

### Task 1: Production execution contract

**Files:**

- Create: `app/orchestra/ai/contracts.py`
- Test: `tests/unit/orchestra/test_contracts.py`

**Interfaces:**

- Produces: `ConversationChannel`, `ConversationEventType`, `ConversationExecutionContext`, and `ConversationEventData`.
- `ConversationExecutionContext` validates UUID identifiers and provides canonical strings to the runtime factory.

- [x] Write tests proving valid context serialization, invalid UUID rejection, and immutable context behavior.
- [x] Run `pytest tests/unit/orchestra/test_contracts.py -v` and verify the import fails.
- [x] Implement string enums and frozen Pydantic models with `extra="forbid"`.
- [x] Run the focused tests and verify they pass.

### Task 2: Customer executor construction seam

**Files:**

- Create: `app/orchestra/ai/customer_runtime.py`
- Modify: `app/api/customer.py`
- Test: `tests/unit/orchestra/test_customer_runtime.py`

**Interfaces:**

- Consumes: `ConversationExecutionContext` and the existing `build_executor()` factory.
- Produces:

```python
def build_customer_executor(
    *,
    context: ConversationExecutionContext,
    space: Space,
    active_agents: list[ResolvedAgent],
    leader: ResolvedAgent | None,
    clarify_enabled: bool,
    llm_model: str | None,
    reasoning_effort: str | None,
) -> Any:
    ...
```

- [x] Write a test that patches `build_executor` and asserts every tenant, chatbot, session, and model argument.
- [x] Run the test and verify the runtime module is missing.
- [x] Implement the focused wrapper with structured logging.
- [x] Replace the three direct production `build_executor()` calls in customer chat, streaming chat, and session warmup.
- [x] Run runtime and contract tests.

### Task 3: Append-only conversation event persistence

**Files:**

- Create: `app/models/conversation_event.py`
- Create: `app/services/conversation_events.py`
- Create: `alembic/versions/0043_conversation_events.py`
- Modify: `app/models/__init__.py`
- Test: `tests/unit/services/test_conversation_events.py`

**Interfaces:**

- Produces:

```python
async def record_conversation_event(
    *,
    context: ConversationExecutionContext,
    event_type: ConversationEventType,
    data: ConversationEventData | None = None,
    message_id: UUID | None = None,
) -> bool:
    ...
```

- The function returns `True` when its independent event transaction commits and `False` when recording fails. Its short-lived database session cannot commit or roll back customer-chat work.

- [x] Write recorder tests with a fake async session for success and failure behavior.
- [x] Run the tests and verify imports fail.
- [x] Add the SQLAlchemy model with indexes for `(space_id, created_at)`, `(session_id, created_at)`, and `(event_type, created_at)`.
- [x] Add migration `0043_conversation_events`, revising the existing `53ad0d7e7d9d` head.
- [x] Implement the recorder with an independent database session so failures do not roll back chat data.
- [x] Import the model from `app/models/__init__.py`.
- [x] Run focused tests and `python -m compileall app`.

### Task 4: Record initial production lifecycle events

**Files:**

- Modify: `app/api/customer.py`
- Test: `tests/unit/api/test_customer_event_mapping.py`

**Interfaces:**

- Consumes: the event recorder and execution context.
- Records `message.received`, `answer.completed`, `feedback.received`, and `escalation.started` where the required identifiers are available.

- [x] Extract pure event-data mapping helpers and test that they exclude reasoning and raw content.
- [x] Record `message.received` after tenant/chatbot/session resolution.
- [x] Record `answer.completed` after the assistant message is persisted so it can reference `message_id`.
- [x] Record feedback only after the scoped message update succeeds.
- [x] Record escalation after staff transfer succeeds.
- [x] Verify recorder failures are logged but do not change HTTP responses.
- [x] Run the focused API tests.

### Task 5: Quality gate and documentation

**Files:**

- Modify: `README.md`
- Modify: `implementation.md`

- [x] Document `/api/chat/*` as the production API and `/api/v1/chat` as legacy/demo.
- [x] Mark the first-sprint contract and event foundation as implemented while leaving later P0 work open.
- [ ] Run `pytest tests/unit -v`.
- [ ] Run `python -m compileall app`.
- [ ] Run `git diff --check` and inspect the final diff for unrelated changes.

## Completion Gate

- Production endpoints share one typed execution context and executor-construction seam.
- Existing public response formats remain unchanged.
- Initial lifecycle events are append-only, tenant scoped, and fail open.
- Focused unit tests pass without PostgreSQL, Redis, or external model credentials.

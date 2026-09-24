# Yullo Home Events Implementation Plan

**Goal:** Record the minimum redacted events needed for Recent, activity counts, grounded patterns, and Orbit without duplicating canonical business data.

**Architecture:** Reuse `conversation_events` for Aura lifecycle telemetry. Add `yullo_home_events` only for non-conversation product events. Event producers live beside the application service that owns the successful mutation.

**Depends on:** `yullo/auraplans/home/README.md`

## Reuse boundary

- Reuse shared `conversation_events` for runtime telemetry, `conversation_logs` for message content, `ai_usage_events` for provider cost, and one neutral `conversation_turns` ledger for idempotent request/response state.
- Keep `yullo_home_events` because Space/source/entity publication events are Yullo product events and do not belong in conversation telemetry.
- Do not create `YulloAuraTurn` or `yullo_aura_turns`; neither remains in the reverted working tree. If a deployed database contains an earlier table, migrate its rows to `conversation_turns`, verify them, and then drop it.
- Reuse `knowledge_base_items`, `ingestion_jobs`, and the current JobRunner for source ingestion. Remove `yullo_sources` after a verified data cutover; do not create a second worker or lease table.

## 3. Events: exact columns, writer, deduplication

Create `app/yullo/adapters/home_events.py`:

```python
async def append_domain_event(db, *, space_id: UUID, event_type: str,
    subject_type: str, subject_id: str, operation_key: str,
    occurred_at: datetime, metadata: dict) -> UUID: ...
```

| yullo_home_events column | Assigned by append_domain_event |
|---|---|
| id | server-generated UUID |
| space_id | validated mutation subject Space; never independent body field |
| event_type | one of source.updated/source.failed/space.published/entity.published |
| subject_type / subject_id | knowledge_item/item.id, space/space.id, entity/entity.id |
| dedupe_key | operation_key supplied by owning service; mandatory for these producers |
| event_metadata | per-event validated scalar allowlist below |
| occurred_at | transaction's server timestamp |
| created_at | server insert timestamp |

Insert using PostgreSQL ON CONFLICT on `(space_id,dedupe_key)` with matching partial-index predicate DO NOTHING, then select the existing ID if necessary. A reused key with different event/subject is a programming error, not a successful retry. No uniqueness exception may poison the caller transaction.

Payload allowlists: source.updated={version,item_id,job_id}; source.failed={version,item_id,job_id,error_code}; space.published={published_version}; entity.published={entity_type,revision}. No raw errors, source text, filenames, URLs, contact details, or generated prose.

Create `app/yullo/adapters/conversation_events.py`:

```python
async def append_aura_event(db, *, session: ChatSession, event_type: str,
    operation_id: UUID, message_id: UUID | None, occurred_at: datetime,
    intent: str | None = None, metadata: dict | None = None,
    rag_hit: bool | None = None, source_count: int | None = None,
    response_ms: int | None = None, error_code: str | None = None) -> UUID: ...
```

Add nullable `dedupe_key VARCHAR(180)` to existing conversation_events with partial unique `(space_id,dedupe_key)`. Old Support247 writers may leave null. Aura uses `aura:{session.id}:{operation_id}:{event_type}`. Set space_id/session_id/runtime_id from the validated session, runtime_type=aura, chatbot_id=null, conversation_id=str(session.id), channel=web. Set message_id to the persisted log ID; retrieval/error events may leave null. Map occurred_at to existing created_at with UTC conversion. Allow metadata keys schema_version=1, traffic_class=production/preview/evaluation, request_id, intent_origin, classifier_version; optional classifier score is diagnostic only.

Core events and logs commit together. Optional telemetry writes use a nested SAVEPOINT if intentionally fail-open; catch outside the savepoint so the outer transaction remains usable. Core message.received and answer.completed are not silently dropped. A failed core transaction returns a retryable failure and no success acknowledgment. This replaces the earlier blanket fail-open advice.

## 4. Source input: UI to committed job

Create `app/yullo/services/sources/service.py:SourceService` and `app/yullo/services/sources/contracts.py`.

```python
async def accept_source(*, user_id: UUID, space_id: UUID,
    command: SourceInput, idempotency_key: UUID) -> SourceAccepted: ...
async def retry_source(*, user_id: UUID, space_id: UUID,
    item_id: UUID, idempotency_key: UUID) -> SourceAccepted: ...
# SourceInput = text{text,title} | url{url} | file{blob_key,title,mime_type}
# SourceAccepted = item_id, job_id, source_version, status='queued'
```

Call from existing onboarding add_source_text/add_source_url, adding an explicit selected draft Space ID. Never select the first draft for a multi-Space owner. Existing frontend field names can be translated at the route boundary. Public/owner APIs never accept kb_id for this workflow.

1. Authenticate owner and validate size/type/URL using existing scraper safety helpers; external fetching happens in worker, not transaction.
2. Store text/file bytes durably via `SourceBlobStore.put` before database transaction. URL source stores the validated URL in the private retry payload. Blob access keys are internal, not public URLs. Blob failure => no job row. Rollback may leave an unreferenced blob; garbage collect after 24h.
3. Begin transaction; lock owned Yullo Space. Resolve/create its primary KB from `yullo_configs.settings.knowledge.primary_kb_id`. Validate stored KB belongs to the same Space and is active. Creation writes KnowledgeBase(space_id, name='Space knowledge', active=true), then stores UUID as string in settings. Space lock prevents duplicate creation.
4. Check `(space_id,creation_key)` on `knowledge_base_items`. Existing key returns the existing item/job; compare request hash and reject conflicting reuse with 409.
5. Insert `KnowledgeBaseItem` immediately as the stable source: Space/KB identity, item type/title/content or private source locator, `ingestion_status='queued'`, `source_version=1`, `published_version=NULL`, content hash, creation key and validated metadata. Document IDs remain null until success.
6. Insert `IngestionJob` attempt 1 with matching Space/KB/item, source version, attempt, idempotency key, source type, queued status and private retry payload. Increment Yullo context version once. Commit item and job together.
7. Attempt dispatch after commit; return 202 with IDs even if broker unavailable because the committed job is recoverable. Never report source ready at this stage.

Implement the shared storage interface in `app/orchestra/ai/ingestion/storage.py` so Support247 and Yullo use the same durable handoff:

```python
async def put(*, space_id: UUID, key: str, body: bytes, content_type: str) -> str: ...
async def materialize(blob_key: str) -> AsyncContextManager[Path]: ...
```

Provide a private `LocalSourceBlobStore` for development/single-host shared-volume deployment. Do not reuse the publicly mounted `/uploads` tree. Select `local|s3|azure` through validated configuration; add the actual cloud adapter only for the chosen deployment target. Production startup rejects unacknowledged ephemeral/local storage. Do not assume API-local files exist on another worker.

`retry_payload` is private and versioned:

```json
{"schema_version":1,"task_name":"ingest_knowledge_item","kb_item_id":"UUID","source_version":1,"blob_key":"private-key-or-null","source_url":"validated-url-or-null","dispatch_attempts":0,"dispatch_after":"UTC timestamp","last_dispatched_at":null}
```

The worker reads Space/KB/item identity from the database. Retry creates a new job linked to the same item/version; it never resets a terminal job. Content replacement increments item source_version; transport retry does not. The shared item is both user-visible document and stable source identity.

## 5. Reliable dispatch and worker finalization

Reuse the existing JobRunner and ingestion pipeline. Extract shared orchestration under `app/orchestra/ai/ingestion/` and register `ingest_knowledge_item`; do not create a parallel Yullo parser/chunker/indexer:

```python
async def dispatch_pending_ingestions(*, limit: int = 100) -> DispatchStats: ...
async def ingest_knowledge_item(*, job_id: str) -> None: ...
async def finalize_item_success(db, *, job_id: UUID, lease_token: UUID,
    result: IndexedSourceResult) -> None: ...
async def finalize_item_failure(db, *, job_id: UUID, lease_token: UUID,
    error_code: str) -> None: ...
```

Extend shared `ingestion_jobs` with nullable lease token/expiry/heartbeat, dispatch timing/attempts, KB item ID, source version, attempt and idempotency key. These are generic ingestion semantics useful to both products. Existing rows remain compatible through null/default values. Do not create `yullo_ingestion_leases`.

Dispatcher scans committed queued item-linked jobs due for dispatch using SKIP LOCKED and calls `get_job_runner().enqueue('ingest_knowledge_item',job_id=...)` outside the transaction. Queue delivery is at-least-once. Production uses existing Celery and durable shared blob storage; local development may use the in-process runner.

Worker sequence:

1. Join job -> knowledge item -> KB -> Space, enforce composite identity and product policy, and verify job source version equals the item's requested version. Claim the shared job lease atomically. Duplicate completed jobs are no-ops.
2. Materialize blob or fetch URL with redirects/SSRF checks and size/time bounds. Parse/chunk/embed using existing ingestion and vector adapters; extract reusable processing primitives from ingest_document into `app/orchestra/ai/ingestion/pipeline.py:parse_and_index(input)->IndexedSourceResult`. Existing Support247 entrypoint keeps its policy; Yullo does not call the existing catch-and-swallow terminal wrapper.
3. Heartbeat lease every 30 seconds. Every heartbeat/progress update predicates on current token; loss of lease aborts further publication. Include enriching in active phases.
4. Use document ID `knowledge:{kb_item_id}:v{source_version}:{lease_token}` with Space/KB/item/version and staged visibility in vector metadata. Database-authorized current item/doc IDs keep staged vectors invisible.
5. Finalization locks item/job, rechecks lease/version/scope, then updates the existing item with document IDs, content hash, ready status, published version and sync time. Set job done and append source.updated with subject_type=knowledge_item and item ID in one SQL transaction.
6. Failure finalization sets job failed and the item's attempt status/error code, then appends source.failed. Preserve an older published version when a refresh fails; otherwise the item stays non-retrievable.

Postgres and vector storage do not share a transaction. Current-item authorization makes staged vectors invisible. Cleanup removes unreferenced attempts after 24h. SQL finalization retries with the same result/token and never emits done early.

Replace product-specific sweeping with shared `reconcile_ingestions(now)` over expired leases, item versions and queued dispatch state. Do not fail a job merely because the API restarted while a Celery worker is alive.

## 6. Aura messages: production transaction sequence

Create `app/yullo/services/conversations/service.py:AuraConversationService`:

```python
async def start_session(*, space_id: UUID, visitor_proof: VisitorProof) -> SessionCreated: ...
async def accept_turn(*, space_id: UUID, session_id: UUID, visitor_proof: VisitorProof,
    client_turn_id: UUID, message: str) -> AcceptedTurn: ...
async def complete_turn(*, turn_id: UUID, result: ValidatedAuraResult) -> None: ...
async def fail_turn(*, turn_id: UUID, code: str) -> None: ...
```

Create shared `conversation_turns`, not a Yullo-only table:

```text
id UUID primary key
space_id UUID not null
session_id UUID not null
client_turn_id UUID not null
request_hash CHAR(64) not null
runtime_type VARCHAR(20) not null
runtime_id VARCHAR(100) not null
runtime_version_id UUID nullable
status VARCHAR(20) not null
user_message_id UUID not null
assistant_message_id UUID nullable
started_at TIMESTAMPTZ not null
finished_at TIMESTAMPTZ nullable
lease_expires_at TIMESTAMPTZ nullable
error_code VARCHAR(80) nullable
```

Allowed status is `accepted|generating|completed|failed|interrupted`. Add unique `(session_id,client_turn_id)`, partial unique active turn per session, and composite Space/session/message constraints after adding the required unique parent keys. Enforce `completed => assistant_message_id and finished_at`, and non-completed states cannot claim a response message. Aura sets `runtime_type=aura`, `runtime_id=<aura UUID>`, and `runtime_version_id=<published Aura version UUID>`; Support247 uses the same generic fields. Store no prompt, user text, response text, citations, reasoning or credentials here: logs own message content, events own evidence/telemetry, and AI usage owns billing.

Session ownership must come from the Aura visitor/session authorization boundary. A raw session UUID is not proof. Implement `verify_visitor_session` using a signed expiring session capability bound to Space and session (dedicated server secret, never logged), or existing equivalent if already supplied by the Aura implementation. Owner preview uses authenticated owner. Reject absent/mismatched proof before loading history. Start endpoint is rate-limited and resolves public publication before inserting session.

Start transaction inserts ChatSession with real runtime identity and commits before returning session/capability. Session creation alone does not count as engagement. Zero-message sessions are excluded from Home.

Accept transaction locks validated session, resolves server-published KB/version/model, permits empty history, and checks client_turn_id. Same ID+hash returns prior result/status; different hash =>409. Insert turn, user ConversationLog, increment message_count, set last_message_at, append message.received. First persisted user message also appends conversation.started with stable operation ID=session.id. Commit before inference. All traffic records carry production/preview/evaluation provenance; Home joins production turns, including for session metrics.

Inference runs outside SQL transaction. `_generate_stream` produces deltas and a typed terminal result; it must propagate failure, not yield an error then appear successful. Validate citations/UI entity IDs against current Space publication. On success, complete_turn transaction inserts assistant log, updates count/time/turn, appends retrieval.completed and answer.completed with actual outcomes, then commits. Only after successful commit emit message.done to browser. On failure persist fail_turn; partial output is not a completed answer or successful Home event. On disconnect cancel inference and finalize interrupted using a separately owned short session; stale generating turns are reconciled after lease expiry. Per-session uniqueness prevents concurrent interleaving.

Client retry with completed client_turn_id replays persisted answer; active returns 409/Retry-After; failed/interrupted requires a new client_turn_id. No duplicate user row, model call, event, or counter for identical retry.

## 8. Space entity, evidence and publication producers

Create `app/yullo/services/entities/service.py`:

```python
async def create_owner_entity(*, user_id, space_id, command) -> SpaceEntityDTO: ...
async def update_entity(*, user_id, space_id, entity_id, patch) -> SpaceEntityDTO: ...
async def confirm_entity(*, user_id, space_id, entity_id,
    expected_revision: int) -> SpaceEntityDTO: ...
async def archive_entity(*, user_id, space_id, entity_id) -> None: ...
```

Each transaction locks the owned Yullo Space/entity and validates `payload_json` using the strict schema selected by `entity_type` and `schema_version`. Owner submissions use `origin_type=owner` and may become `owner_confirmed`; owner APIs cannot assert `source_authoritative`. Eligible means active AND public AND trusted review status AND current evidence provenance, or an explicit owner-origin entity. Detect old eligibility versus new eligibility under lock.

Create `app/yullo/services/entities/extraction.py`:

```python
async def extract_entity_candidates(*, source_item_id: UUID,
    source_version: int) -> list[ValidatedEntityCandidate]: ...
async def persist_entity_candidates(*, source_item_id: UUID,
    source_version: int,
    candidates: list[ValidatedEntityCandidate]) -> list[UUID]: ...
```

The model call runs outside a transaction and returns bounded structured candidates only. `persist_entity_candidates` opens a short transaction, locks and revalidates the current same-Space item version, validates every entity payload and evidence locator, then inserts `yullo_space_entities(review_status='extracted',origin_type='extracted')` plus `yullo_space_entity_evidence`. Stale source versions are rejected. Extracted entities remain unavailable to public Aura until owner confirmation. An approved integration uses a separate allowlisted adapter with stable provider/external IDs; only that adapter may create `source_authoritative` records.

Owner-created entities require no evidence row because the authenticated owner command is the authority. Extracted entities require at least one evidence row. One entity may have several evidence rows across several documents. Evidence stores item/version/page/section/chunk identifiers only; files, URLs, source text and embeddings stay in shared knowledge storage.

Add `revision INTEGER NOT NULL DEFAULT 1` to `yullo_space_entities`; increment on material changes. On ineligible-to-eligible transition insert `entity.published` with key=`entity.published:{entity.id}:{revision}` in the same transaction. A title edit while already eligible does not create a publication event. Archive removes capability from the next Home read; existing events remain history and actions revalidate the current entity.

Migrate the provisional `yullo_resources` table through expand/migrate/contract: create entity/evidence tables, map `resource_type` to controlled `entity_type`, schema-validate payloads, create evidence rows only after same-Space item/version verification, report invalid rows, switch API/runtime/Home readers, verify counts and payload parity, then drop the old table/model/routes. Never rename blindly while retaining the unsafe scalar provenance FK.

Create `app/yullo/services/spaces/publication.py:publish_space(user_id,space_id,expected_context_version)` and call it from existing launch_space. Lock exact Space, verify handle and ready preview/current context, call actual Aura publication service, set Space live and clear reservation, update user onboarding flag, append space.published keyed by published version, commit together. Already published same version is no-op. No first-live-Space fallback. If Aura publication prerequisite is absent, return unavailable rather than fabricate version.

Fact extraction remains a separate knowledge pipeline. Home never inserts KBFact. There is no verified Yullo auto-extraction producer in the inspected source-ingestion path: ingesting text must not imply facts were extracted. Display needs-review only for actual existing extracted rows. Any new automatic extraction flow requires the Aura knowledge plan's scoped writer, provenance, and review lifecycle before enabling it.

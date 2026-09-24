# Yullo Home Data Architecture and Plan Index

> **For agentic workers:** Read this file and the parent plan before implementing any focused plan. Execute the focused plans in numeric order.

**Goal:** Make every Yullo Home value traceable to an authenticated product action, canonical database state, or approved provider without turning generated UI text into source data.

**Parent plan:** `yullo/auraplans/2026-09-19-yullo-home-backend-integration.md`

## Read these plans in execution order

All named new functions are implementation contracts unless explicitly marked as present. Repository audit: 2026-09-20 after the user's code revert. The working tree contains partial Yullo models and uncommitted migrations; existence in source does not prove that a migration was applied to any deployed database.

1. [Home events and production writers](01-home-events-plan.md): database/event mapping, source inputs, durable dispatch, shared conversation-turn persistence, entity/publication producers.
2. [Current-state reads](02-current-state-plan.md): exact snapshot contract, queries, metric definitions and migrations/rollout.
3. [Intelligence generation](03-intelligence-signals-plan.md): intent input, deterministic functions, thresholds, evidence and examples.
4. [Orbit](04-orbit-plan.md): provider contracts, selection, unavailable inputs.
5. [API/frontend](05-api-frontend-integration-plan.md): response adapter, action execution and owner cache isolation.
6. [Preferences](06-section-preferences-plan.md): exact authenticated write transaction and UI mutation.

## Post-revert implementation inventory

This inventory is the starting point for execution. Re-check it immediately before coding.

| Responsibility | Current working-tree state | Required plan action |
|---|---|---|
| Shared `spaces.product` and product-aware slug identity | Present in model/migration work | Reuse and validate; do not create another tenant root. |
| `knowledge_bases` plus item `space_id`/composite ownership | Present | Reuse as group/item hierarchy. |
| KB item ingestion lifecycle/version columns | Absent from ORM; present only in current head migration candidate | Repair ORM/migration parity before applying. |
| Generic ingestion attempt/idempotency/lease columns | Absent from ORM; present only in current head migration candidate | Repair ORM/migration parity and shared runner behavior. |
| `yullo_spaces` | ORM absent; present only in current head migration candidate | Restore one Yullo extension model; do not create another root identity. |
| `yullo_sources` | Model, migration and runtime references present | Treat as transitional; backfill shared items/jobs, cut over, then drop. |
| Hardened `kb_facts` | Present | Reuse after verifying migration state and current-source filters. |
| Chat/log/event runtime identity | Present | Reuse `runtime_type='aura'` and real runtime IDs. |
| Shared `conversation_turns` | Absent | Create neutral ledger once. |
| `yullo_aura_turns` | Model/migration absent after revert | Do not create; conditionally clean only an external database that still has it. |
| Provisional `yullo_resources` | Present | Migrate valid rows to `yullo_space_entities`, create evidence links, switch callers, verify parity, then drop the ambiguous table. |
| `yullo_space_entities` and evidence | Absent | Create strict typed entity/evidence models; general facts remain in `kb_facts`. |
| `yullo_user_sessions`, `yullo_user_preferences` | Present | Keep and extend; do not recreate. |
| `yullo_home_events` | Absent | Create as the only Yullo Home domain-event table. |
| `yullo_configs` | Present | Narrow to validated Space runtime settings; prevent overlap with `yullo_spaces`, Aura versions and user preferences. |
| Yullo Home service/API/frontend | Partial | Replace fixtures/hardcoded metrics incrementally through the focused plans. |

## Implementation kickoff decisions

### 1. Migration and service order

Start with the final ORM contracts and additive Alembic migrations, apply them to a disposable/local or test database, and only then write services against those columns. Do not apply a destructive all-in-one migration to production before the code cutover.

Use this sequence:

1. Inspect both the repository head and deployed database revision. The repository currently reports Alembic head `785d571cb2a5`; the deployed/current revision was not verifiable from this workspace because the local PostgreSQL connection was unavailable.
2. Review and repair the present `b3fde12ef656_add_yullospace_and_generic_ingestion_.py` migration before applying it, and restore matching ORM fields/models in the same change. The migration exists at repository head, but `app/models/yullo_space.py` and the generic item/job fields are absent after the revert. Do not apply schema that the ORM cannot represent and do not generate duplicate columns.
3. Add the next chained expand migration for Home events, shared `conversation_turns`, Home section preferences and conversation-event dedupe. No `YulloAuraTurn` model or `yullo_aura_turns` migration remains after the revert.
4. Implement shared ingestion and Yullo services against the expanded schema.
5. Run an idempotent data migration/backfill for Yullo Space extensions and temporary source records. Report ambiguous rows; do not guess.
6. Switch reads/writes, verify parity and observe production.
7. Apply a later contract migration that removes `yullo_sources`, any actually-created `yullo_aura_turns`, and moved Yullo-only columns from `spaces`. Preserve `space_sources` if a verified legacy Support247 consumer still uses it.

Do not hard-code migration number `0068` or an assumed `down_revision`. Generate each revision from the actual head at implementation time. Validate upgrade from the current deployed revision, a clean database upgrade to head, and downgrade of only the new expand revisions before service work proceeds.

### 2. `yullo_spaces` status

`yullo_spaces` exists only in the current uncommitted Alembic-head migration after the revert; the matching ORM model is absent. Treat that revision as an implementation candidate that must be reviewed and paired with the model before application. Do not create a second migration/table. The target remains this foundational one-to-one Yullo extension:

```text
yullo_spaces.space_id UUID PRIMARY KEY
  -> spaces.id ON DELETE CASCADE
purpose
onboarding_step
lifecycle_status
handle_reserved_until
context_version
preview_version
published_version
published_at
appearance_config
created_at / updated_at
```

Backfill only rows where `spaces.product='yullo'`. Enforce that invariant with the database trigger specified in the Aura plan. Keep the current `spaces` lifecycle columns during the expand/cutover period; services must not dual-write indefinitely. Once all Yullo reads use `yullo_spaces` and parity is verified, remove the migrated Yullo-only columns in the contract migration.

### 3. Blob storage decision

No S3, Azure Blob or generic object-storage interface exists in the inspected repository. Current document and Yullo ingestion write to the local `uploads/` directory. That path is safe only when the API and worker share the same durable mounted filesystem; it is not automatically safe for multi-host Celery workers or ephemeral containers.

Implement a small shared interface under `app/orchestra/ai/ingestion/storage.py`, not a Yullo-only adapter:

```python
class SourceBlobStore(Protocol):
    async def put(self, *, key: str, body: bytes, content_type: str) -> BlobRef: ...
    async def materialize(self, ref: BlobRef) -> AsyncContextManager[Path]: ...
    async def delete(self, ref: BlobRef) -> None: ...
```

Provide `LocalSourceBlobStore` first for development and single-host/shared-volume deployments. Configure it with an absolute `SOURCE_BLOB_LOCAL_ROOT`, use randomized internal keys, atomic writes, path-containment checks and private permissions. Do not expose that directory through `/uploads` static serving.

Selection is configuration-driven: `SOURCE_BLOB_BACKEND=local|s3|azure`. Startup must fail in production when `local` is selected without an explicit durable shared-volume acknowledgement. Do not implement an arbitrary cloud adapter before the deployment target is known. If production uses AWS/S3-compatible storage, add `S3SourceBlobStore`; if it uses Azure, add `AzureSourceBlobStore`. Both implement the same interface, use workload/managed identity where available, keep buckets/containers private, and pass only opaque blob references to workers.

Data flow: owner/visitor action -> validated command -> committed canonical records/events -> grouped snapshot -> pure rules -> Home API -> frontend. The GET route never inserts intelligence rows or calls a model.

Production reliability extends shared `ingestion_jobs`, adds shared `conversation_turns`, and adds `yullo_home_events`. No Yullo-only ingestion, turn, run or intelligence table is required.

## Shared database reuse decision

Reuse the existing neutral hierarchy as the canonical knowledge store:

```text
spaces (shared tenant/root identity)
  -> yullo_spaces (Yullo-only extension and database product boundary)
  -> knowledge_bases (shared knowledge group)
       -> knowledge_base_items (shared document/text/Q&A record)
            -> vector chunks (shared store, filtered by Space + KB)

ingestion_jobs -> attempts/lifecycle -> shared KB item
kb_facts -> deterministic facts -> shared KB/item
yullo_space_entities -> typed public Aura UI entities
yullo_space_entity_evidence -> exact shared item/version provenance
```

`yullo_spaces` does not replace or duplicate the shared Space identity. It owns Yullo lifecycle/publication fields. Its FK alone does not prove the parent is a Yullo Space, so every service still enforces `spaces.product='yullo'`; add a database enforcement mechanism only if it can be maintained without duplicated product state.

| Existing schema | Decision | Reason and required correction |
|---|---|---|
| `spaces` | Reuse as root | Ownership, product discriminator, slug, name and common identity are already canonical. Do not create a second independent Space identity. Move Yullo-only onboarding/publication state to the one-to-one `yullo_spaces` extension during the Aura migration. |
| `knowledge_bases` | Reuse as knowledge group | It already belongs to one Space and supports several groups per Space. Existing `(id,space_id)` uniqueness supports composite tenant constraints. Yullo services create/select a primary group through `yullo_configs`; do not create `yullo_knowledge_groups`. |
| `knowledge_base_items` | Reuse as document/item catalogue | It already supports document, URL, text and Q&A items and links indexed document IDs. Keep actual chunks in the existing vector store. All writers must set `space_id`; current shared/Yullo ingestion writers that omit it must be fixed. |
| Chroma/vector collection | Reuse | Current backend already ANDs `client_id=space_id` with `kb_id`. Aura must resolve allowed KB IDs server-side and must never trust request-provided KB IDs. Retrieval should additionally limit to current published item/doc IDs during source replacement. |
| `ingestion_jobs` and JobRunner | Reuse and extend | Link every attempt to a shared knowledge item and add generic dispatch, lease, attempt, version and idempotency fields. Do not build a second ingestion engine or `yullo_ingestion_leases`. |
| `kb_facts` | Reuse | It is the deterministic truth layer and now has review, validity, version and supersession fields. Require the existing composite Space/KB/item relationships and current source-version filtering. Mem0 is not the primary truth store. |
| `chat_sessions`, `conversation_logs`, `conversation_events` | Reuse | Runtime identity columns distinguish Aura from Support247 traffic. Keep messages in logs and telemetry/evidence in events. |
| `conversation_turns` | Create as shared table | One request/response operation with idempotency, lifecycle and message links. Both Aura and Support247 can use it through runtime type/id. It contains no message text or reasoning. |
| `yullo_aura_turns` | Do not create | The reverted working tree has no model or migration for this table. If an external/deployed database happens to contain it from an earlier attempt, backfill shared `conversation_turns`, verify per-session counts and message links, then drop it. |
| `agent_knowledge_bases` | Do not use for Aura v1 | It represents Support247 CustomAgent assignments. Aura v1 gets its published KB assignments from the Yullo Aura version/config boundary, avoiding Support247 agent semantics. |
| `space_sources` | Migrate Yullo rows, then stop using for Yullo | Convert each Yullo onboarding source into a pending shared knowledge item and linked job attempt. Preserve it only for remaining legacy consumers. |
| `yullo_sources` | Remove after migration | It duplicates the logical source identity now assigned to `knowledge_base_items`. Backfill its lifecycle fields into shared items/jobs, switch readers/writers, verify parity, then drop it. |
| Provisional `yullo_resources` | Migrate then remove | Its name and single scalar source FK are ambiguous. Backfill typed entities and evidence links, switch all readers/writers, verify parity, then drop it. |
| `yullo_space_entities` | Create Yullo-specific | Stores strictly typed offering/location/portfolio/contact/person/event/action objects for deterministic lookup and UI. It is not knowledge storage; general facts remain in `kb_facts`. |
| `yullo_space_entity_evidence` | Create Yullo-specific | Joins an entity to one or more exact same-Space knowledge item versions and bounded evidence locations. It stores no PDF, URL body, chunk text or embedding. |
| `yullo_home_events` | Keep separate | Existing conversation events cover runtime activity, not source/entity/Space publication history. This table stores only redacted Yullo domain events. |
| `yullo_user_preferences`, `yullo_user_sessions` | Keep separate | Theme/Home layout and Yullo cookie-session revocation are product behavior. They reuse shared `users` identity but must not alter Support247 preferences or browser session behavior. |
| `yullo_configs` | Consolidate deliberately | Keep only schema-validated Space-level runtime configuration that does not already belong in `yullo_spaces` or an Aura version. Do not use free-form settings as a second owner of lifecycle, publication, knowledge assignment, or preferences. |

### Required constraint repairs before relying on reuse

- Extend `knowledge_base_items` with generic lifecycle fields: `ingestion_status`, `source_version`, `published_version`, `content_hash`, private `source_locator`, `source_metadata`, `creation_key`, `last_synced_at`, and `last_error_code`.
- Extend `ingestion_jobs` with `kb_item_id`, `source_version`, `attempt`, `idempotency_key`, dispatch fields, and nullable lease fields. Enforce `(kb_item_id,space_id,kb_id) -> knowledge_base_items(id,space_id,kb_id)`. A retry creates a new attempt for the same item.
- Make Yullo-only tables reference `yullo_spaces.space_id` where the Aura plan requires a database product boundary. A trigger/check on `yullo_spaces` verifies its parent `spaces.product='yullo'`.
- Add `UNIQUE(id,space_id)` to `yullo_space_entities`. Enforce evidence FKs `(entity_id,space_id) -> yullo_space_entities(id,space_id)` and `(source_item_id,space_id,kb_id) -> knowledge_base_items(id,space_id,kb_id)`.
- Migrate the provisional `yullo_resources` rows by mapping `resource_type` to controlled `entity_type`, validating each payload, creating an evidence row for valid source provenance, and reporting invalid/cross-Space rows. Do not copy arbitrary JSON blindly.
- Fix `app/api/v1/knowledge_base.py:add_item` and `app/orchestra/ai/ingestion/jobs/tasks.py:_attach_kb_item`; both currently construct `KnowledgeBaseItem` without required `space_id`.
- Replace migration `0060_migrate_yullo_sources_to_knowledge.py`: migrate only Yullo `space_sources`/`yullo_sources` into shared items/jobs using stable legacy IDs as idempotency keys. Never copy Support247 rows into a Yullo table. Drop `yullo_sources` only after cutover and parity checks.
- Create only the neutral `ConversationTurn` model/table. If `yullo_aura_turns` was created outside the reverted working tree, use expand/backfill/read-switch/contract; otherwise there is nothing Yullo-specific to drop.
- Keep shared knowledge routes/services distinct from Yullo product routes. Reuse models and ingestion primitives, while Yullo auth, publication rules, UI and permissions remain under `app/yullo/`.

The result is shared storage with product-specific policy. Duplication is avoided at the Space, knowledge-group, document, vector, fact, ingestion and conversation layers; Yullo tables exist only for semantics the shared tables do not contain.
## 1. Observed code and required corrections

| Existing module/function | Observed behavior | Required implementation |
|---|---|---|
| `app/api/v1/yullo_onboarding.py:add_source_text/add_source_url` | Writes `SpaceSource`, bypassing real ingestion | Call `SourceService.accept_source` below |
| `app/yullo/adapters/ingestion.py:enqueue_text/enqueue_url` | Flushes rows then dispatches; payload omits KB identity and uses `url` instead of worker `source_url` | Replace direct dispatch with committed job intent and explicit payload mapping |
| `app/orchestra/ai/ingestion/jobs/tasks.py:ingest_document` | Random doc ID on each run; swallows KB-link failure; marks done separately | Yullo path uses stable source/version doc ID and transactional finalization |
| same module `_attach_kb_item` | Does not set required `KnowledgeBaseItem.space_id` | Shared correctness fix: derive Space from validated KB; Yullo finalizer inserts its own linked item |
| same module `_set_job` | Swallows errors and commits each update | Use for progress only; never for authoritative Yullo terminal status |
| `app/orchestra/ai/ingestion/jobs/sweeper.py:sweep_interrupted_jobs` | Changes failed state without Home event; active states omit enriching | Route Yullo terminal changes through finalizer; include enriching |
| `app/yullo/api/public.py:start_aura_session` | Uses `default_aura` | Resolve actual published runtime server-side; no fabricated identity |
| `app/yullo/services/inference/runtime.py:stream_response` | Rejects empty history, trusts request KB IDs, yields done before answer persistence | Validate session independently, resolve authorized context server-side, commit before done |
| `app/core/database.py:get_db` | Commits when dependency exits | Explicit command transaction before response/stream acknowledgment; do not rely on teardown commit |
| `app/api/v1/yullo_resources.py:create_resource/update_resource` | Provisional routes write and commit directly; product check absent | Replace with Yullo entity commands/routes, validate type schema, product, evidence and lifecycle, then remove the old resource API |

## 2. Common contracts and transaction ownership

Create `app/yullo/services/home/contracts.py` for immutable internal DTOs and `app/yullo/services/access.py` for scope resolution.

```python
async def require_owned_yullo_space(db, *, user_id: UUID, space_id: UUID,
                                    lock: bool = False) -> Space: ...
async def resolve_public_aura(db, *, space_id: UUID) -> PublishedAuraContext: ...

# PublishedAuraContext: space_id, runtime_id, published_version,
# authorized_kb_ids, allowed_entity_ids, allowed_model, traffic_class.
# All values resolved from published server state, never from chat body.
```

`require_owned_yullo_space` selects by ID + owner_user_id + product=yullo; absent/unauthorized yields the same 404. Lock uses SELECT FOR UPDATE. Public resolver requires live Space and published Aura; absent publication is unavailable, not default_aura. The actual Aura publication model is a prerequisite from the Aura plan; if missing, stop that producer and report unavailable rather than invent its schema.

Routes delegate to command services using a session factory. Each command service owns a short `AsyncSessionLocal()` / `db.begin()` transaction. Repositories accept that session and never commit. Pass primitive IDs/DTOs across transactions; do not reuse detached ORM objects. No SQL transaction remains open across model, network, vector, or blob-storage calls.

New timestamps use aware UTC. Existing naive SQL timestamps are interpreted/written as UTC at adapters; conversion must be explicit. Auth and product checks apply on writes as well as reads.

## 13. Implementation order and handoff

- [ ] Implement contracts, ownership/public-session authorization, migrations and safe event appenders.
- [ ] Implement SourceService input mappings, durable blob adapter and transactional job intent.
- [ ] Implement dispatcher/lease worker/finalizers and source cutover.
- [ ] Implement AuraConversationService over the shared conversation-turn ledger and persist completion before `message.done`.
- [ ] Implement entity/evidence/publication command services and event transitions.
- [ ] Implement snapshot queries, deterministic intent ingestion and pure signal functions.
- [ ] Implement API mapping, action resolver and owner-keyed frontend query.
- [ ] Implement preference command/UI mutation and rollout checks.

Existing Home visuals stay. Missing Aura publication or source storage integration is a named dependency, never permission for a coding agent to invent tables, success states, or external provider data.

## Completion audit follow-up — 2026-09-20

[Implementation completion and entity creation](08-implementation-completion-plan.md): ordered fixes for entity contracts and provenance, ingestion recovery, bootstrap verification, Home/UI data and preferences, and migration reconciliation. Includes explanations and creation flows for all seven entity types.

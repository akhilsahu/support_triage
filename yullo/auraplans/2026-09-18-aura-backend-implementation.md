# Yullo.co Aura Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one grounded, configuration-driven, pluggable, isolated Aura per Yullo Space while safely reusing Support247's shared ingestion, knowledge, conversation, model, usage, and evaluation infrastructure.

**Architecture:** Yullo is a product module under `app/yullo/`. Shared infrastructure remains in its existing packages and is consumed through Yullo adapters. A shared `Space` identifies the product and tenant; Yullo-only state uses `yullo_*` tables. Aura v1 uses only the current Space's explicitly assigned, published knowledge and returns validated entity-backed UI.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy async, PostgreSQL, Alembic, Redis, ChromaDB/Agno knowledge backend, React/TypeScript, pytest, Vitest.

**Spec:** This document's “Information and locked decisions,” “Target tables and columns,” and “Isolation model” sections are the approved design specification.

## Global constraints

- One user may own multiple Spaces; each Space belongs to exactly one product.
- Each Yullo Space has exactly one isolated Aura in v1.
- Aura must never guess. Every factual claim must be supported by authorized Space data or an authorized deterministic tool result.
- Aura must not infer from, retrieve from, route to, or delegate to another Space.
- Yullo and Support247 keep separate frontend contracts and runtime behavior.
- Existing Support247 knowledge-group and document assignments must continue working unchanged.
- Yullo code is configuration-driven, pluggable, and isolated.
- AI may choose intent and presentation, but deterministic backend code owns identity, permissions, forms, submissions, bookings, payments, and other business state.
- Owner onboarding remains minimal; backend complexity is not exposed in onboarding forms.
- New Yullo-only database tables use the `yullo_` prefix. Shared tables keep their current names.
- All tenant-owned reads and writes are scoped by `product` and `space_id`; UUID possession alone is never authorization.
- Current uncommitted repository changes belong to the user and must be preserved.

### Canonical reuse rule

Reuse a table or service only when its meaning is product-neutral and Yullo can enforce `product='yullo'` plus same-Space ownership at its adapter boundary. Extend that shared primitive with neutral columns when both products need the behavior. Keep Yullo policy, publication, structured entities, preferences, sessions, API contracts, and frontend under Yullo-owned modules. Never reuse Support247 business behavior merely because its code already exists.

Working-tree status as of 2026-09-20 after the user's code revert: an Alembic-head candidate creates `yullo_spaces` and generic ingestion columns, but the matching `YulloSpace` model and item/job ORM fields are absent. `YulloSource` remains transitional. `YulloAuraTurn` and its migration are absent. Source presence is not proof that a migration is deployed. Repair model/migration parity before application, do not generate duplicates, migrate valid data, switch runtime reads/writes, verify parity, and then remove duplicate source infrastructure.

---

## Information and locked decisions

### Product model

- One `User` can own multiple `Space` records.
- A Space belongs to either `support247` or `yullo`.
- The same user can own Spaces in both products, but ownership does not grant cross-product data access.
- A Yullo Space owns identity, appearance, knowledge assignments, actions, conversations, published state, and one Aura.
- Future cross-Space or cross-product sharing requires an explicit, revocable grant. It is documented but not implemented in v1.

### Aura definition

Aura is a scoped runtime attached to one Yullo Space. It combines that Space's identity, published knowledge, behavior configuration, capability configuration, permitted tools, session context, and validated UI contract.

Aura is not a Support247 `Chatbot`, `CustomAgent`, or agent team. It may reuse shared lower-level services, but it does not inherit Support247 handoff, triage, routing, widget, or agent-team semantics.

### Grounding rule

For each factual sentence, the runtime must have at least one of:

1. A structured Space-owned record returned by deterministic lookup.
2. A published, visible knowledge passage assigned to the current Aura.
3. A successful authorized read-tool result.

When evidence is absent or conflicting, Aura returns a concise limitation such as “That information has not been shared here yet,” optionally followed by an available contact action. Model confidence is never evidence.

### Minimal onboarding flow

```text
Choose purpose
    ↓ create draft Yullo Space + Aura shell
Claim name and handle
    ↓ save structured identity; no model call
Share one link or description
    ↓ create source; enqueue ingestion
Preview
    ↓ build grounded draft version; run same Aura runtime privately
Publish
    ↓ atomically select reviewed Aura + knowledge version
```

Optional logo, uploads, additional sources, and advanced capabilities remain under later enrichment or “More options.”

### Request flow

```text
Visitor message
    ↓
Resolve product + Space + published Aura
    ↓
Create immutable YulloExecutionContext
    ↓
Deterministic route available?
    ├── yes → structured lookup/tool → validated UI
    └── no  → scoped retrieval → evidence gate → model response
                                      ↓
                              response validation
                                      ↓
                    text + citations + entity-backed UI
```

### Folder structure

Use product-first organization:

```text
app/yullo/
├── api/
│   ├── onboarding.py
│   ├── owner.py
│   └── public.py
├── models/
│   ├── aura.py
│   └── space.py
├── schemas/
│   ├── common.py
│   ├── onboarding.py
│   ├── knowledge.py
│   ├── aura.py
│   ├── ui.py
│   └── public.py
├── services/
│   ├── onboarding/
│   ├── knowledge/
│   ├── aura/
│   └── publishing/
└── adapters/
    ├── ingestion.py
    ├── retrieval.py
    ├── conversations.py
    ├── models.py
    ├── usage.py
    └── evaluations.py
```

Use `app/yullo/services/`, not `app/services/yullo/`, because Yullo's API, schemas, models, services, and adapters change together and must remain visibly separate from Support247 behavior.

Use the same product-first boundary in the frontend:

```text
ui/src/yullo/
├── api/
├── components/
│   └── generative-ui/
├── config/
├── hooks/
├── screens/
├── services/
│   └── aura/
└── types/
```

Only product-neutral primitives belong in `ui/src/shared/`. Yullo must not import Support247 screens, chatbot state, render blocks or API clients. Support247 must not import Yullo Aura components. Root routing may select a product entry point, but it must not contain product behavior.

### Database naming

- Shared tables remain neutral: `spaces`, `knowledge_bases`, `knowledge_base_items`, `ingestion_jobs`, `chat_sessions`, `conversation_turns`, `conversation_logs`, `conversation_events`, `ai_usage_events`, `evaluation_*`.
- New product-owned tables use `yullo_`: `yullo_spaces`, `yullo_auras`, `yullo_aura_versions`, `yullo_aura_knowledge_assignments`. Source ingestion and turn execution remain shared; migrate/remove temporary `yullo_sources` and do not create `yullo_aura_runs`.
- Every Space-scoped `yullo_*` table references `yullo_spaces.space_id`, preventing a Support247 Space from acquiring Yullo state. User-scoped Yullo tables reference shared `users.id` instead.

---

## Existing table and schema reuse matrix

| Existing table or contract | Decision | Required action |
|---|---|---|
| `users`, `auth_identities` | Reuse | Keep user identity product-neutral. |
| `spaces` | Reuse root | Add `product`; replace global slug uniqueness with `(product, slug)`; migrate Yullo lifecycle fields to `yullo_spaces`, then remove the legacy columns. |
| `space_sources` | Migrate Yullo rows then stop using | Backfill Yullo rows into pending shared `knowledge_base_items` plus linked `ingestion_jobs`; preserve only for remaining legacy consumers. |
| `knowledge_bases` | Reuse | Every Yullo Space receives a default knowledge group; preserve Support247 groups. |
| `knowledge_base_items` | Reuse as source/document identity | Add `space_id`, ingestion lifecycle, version, content hash, private source locator, idempotency and publication metadata plus composite ownership constraints. |
| `agent_knowledge_bases` | Support247 only | Do not attach Aura through this table. |
| `kb_facts` | Harden and reuse | Add typed value, review state, validity, source version, supersession and strict Space scoping. Do not replace with Mem0. |
| `ingestion_jobs` | Reuse and extend | Link each attempt to a shared knowledge item/version; add generic attempt, idempotency, dispatch and worker-lease fields; reject stale completions. |
| Chroma/knowledge backend | Reuse through adapter | Backend-created filters must include Space, Aura assignments, visibility and published version. |
| `chat_sessions` | Reuse | Add product/runtime identity; Yullo leaves Support247 escalation fields null. |
| `conversation_turns` | Create shared | Persist one retry-safe request/response operation with generic runtime/version identity and message links. No message text or reasoning. |
| `yullo_aura_turns` | Do not create | It would duplicate the neutral turn ledger. The reverted tree contains no model/migration. If an external database contains an earlier table, backfill and verify it before dropping it. |
| `conversation_logs` | Reuse canonical messages | Store citations and Yullo UI nodes in existing JSONB fields after schema validation. |
| `conversations`, `messages` | Do not use for Aura | Avoid a third message path; document as legacy/generic orchestration storage. |
| `conversation_events` | Reuse after generalization | Make `chatbot_id` optional and add runtime type/id or equivalent registration. |
| `ai_usage_events` | Reuse | Add product/runtime metadata; do not create duplicate Aura cost accounting. |
| `evaluation_*` | Reuse after generalization | Add runtime type/id and Aura grounding expectations. |
| `chatbots` and chatbot UI tables | Support247 only | Aura has its own tables and public schema. |
| built-in/custom agent tables | Support247 only | Aura v1 is single-runtime; no agent team. |
| datasource connections/tools | Future reuse | Use through explicit Aura tool assignment; exclude from initial grounded-Q&A milestone. |
| `agent_tool_assignments` | Support247 only | Create Yullo assignment only when tools enter scope. |
| inbox/staff/queue/canned replies | Support247 only | Excluded from Aura v1. |
| `documents` | Reconcile first | Migration creates it but no current ORM model exists; identify actual runtime ownership before reuse. |
| `agent_definitions` | Legacy | Migration creates it but current models do not use it; exclude from Aura. |
| `yullo_spaces` | Keep Yullo extension | It owns lifecycle/onboarding/publication fields while `spaces` remains the shared identity and owner root. |
| `yullo_configs` | Narrow and consolidate | Use only for validated Space runtime settings not owned by `yullo_spaces` or an Aura version. It must not become a second lifecycle, publication, knowledge-assignment, or preference store. |
| `yullo_resources` | Rename/migrate | Existing provisional table name is ambiguous. Migrate valid rows to `yullo_space_entities`, migrate provenance to `yullo_space_entity_evidence`, switch callers, verify parity, then drop it. |
| `yullo_space_entities` | Keep Yullo-specific | Strictly typed, reviewed Space objects drive deterministic lookup and generative UI: offering, location, portfolio item, contact channel, person, event and action. General facts remain in `kb_facts`. |
| `yullo_space_entity_evidence` | Keep Yullo-specific | Links an entity to one or more same-Space knowledge items/versions and evidence locations without copying files, URLs, chunks or document text. |
| `yullo_home_events` | Keep Yullo-specific | Redacted non-conversation domain history is distinct from shared runtime telemetry. |
| `yullo_user_sessions`, `yullo_user_preferences` | Keep Yullo-specific | Reuse `users` identity while isolating Yullo cookie revocation, theme, timezone and Home layout from Support247. |

### Schema reuse rules

Reuse these internal contracts or extract a neutral version when necessary:

- Parsed document and parsed page.
- Chunk and chunk metadata.
- Ingestion state and progress.
- Citation/source reference.
- Model usage.
- Retrieval result.
- Evaluation check and grade.

Create Yullo-specific public contracts for:

- Onboarding draft and source status.
- Public Space identity.
- Aura configuration and versions.
- Aura message request and stream events.
- Citation/evidence output.
- Entity-backed UI nodes.
- Preview and publishing.

Support247 render blocks permit model-authored tables/cards/tabs. Yullo UI nodes reference authoritative Space entities:

```json
{
  "uiVersion": 1,
  "text": "Brand strategy starts at ₹75,000.",
  "citations": [{"sourceId": "src", "documentId": "doc", "chunkId": "chunk"}],
  "ui": [{"type": "offering", "entityId": "entity-id"}],
  "followups": []
}
```

The backend validates that `entityId` belongs to the current Space, has an allowed entity type, and is eligible in the published version before streaming it.

---

## Target tables and columns

### Changes to `spaces`

| Column | Type | Rules |
|---|---|---|
| `product` | `VARCHAR(20)` | Non-null; `support247` or `yullo`. |
| `slug` | existing | Unique with `product`, not globally. |
| `owner_user_id` | existing UUID | Owner identity; does not confer access to another Space's records. |

Migration strategy: backfill existing non-draft Spaces as `support247`; backfill current Yullo onboarding drafts only when identified by owner/onboarding data and verified by migration tests. Do not infer Yullo from slug or hostname.

The shared `spaces` row keeps only product-neutral identity and ownership. Existing Yullo fields on `spaces` are temporary migration inputs, not permanent deprecated columns:

- `purpose` → `yullo_spaces.purpose`
- `current_step` → `yullo_spaces.onboarding_step`
- `context_version` → `yullo_spaces.context_version`
- `preview_context_version` → `yullo_spaces.preview_version`
- `handle_reserved_until` → `yullo_spaces.handle_reserved_until`
- Yullo `draft`/`live` state → `yullo_spaces.lifecycle_status`

Use an expand-migrate-contract rollout. First add the product column and Yullo tables, backfill verified Yullo rows, and temporarily dual-write or mirror through the Yullo service. Next switch every Yullo read and write to the new tables and verify row counts, values, foreign keys and rollback. Only then drop the legacy Yullo columns from `spaces`, drop `space_sources`, and remove the compatibility code. Do not leave two long-term sources of truth.

Classify existing Yullo rows from verified onboarding evidence, such as a non-null Yullo purpose or an existing onboarding source, and produce an exception report for ambiguous rows. Never classify by hostname, slug, or a default-valued onboarding column. Abort the contract migration while any Yullo route still references a legacy field.

### `yullo_spaces`

| Column | Type | Rules |
|---|---|---|
| `space_id` | UUID PK/FK | References `spaces.id`; target must have `product='yullo'`. |
| `purpose` | VARCHAR(30) | `personal`, `work`, `business`, `organization`. |
| `onboarding_step` | VARCHAR(20) | `choose`, `claim`, `teach`, `preview`, `complete`. |
| `lifecycle_status` | VARCHAR(20) | `draft`, `preparing`, `live`, `paused`, `archived`; Yullo publication lifecycle only. |
| `handle_reserved_until` | TIMESTAMPTZ nullable | Temporary reservation expiry used during onboarding. |
| `appearance_config` | JSONB | Validated semantic design config; no arbitrary CSS/HTML. |
| `context_version` | INTEGER | Incremented when sources or authoritative identity change. |
| `preview_version` | INTEGER | Last version assembled for owner preview. |
| `published_version` | INTEGER nullable | Version served publicly. |
| `published_at` | TIMESTAMPTZ nullable | Publication time. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Audit timestamps. |

### Shared knowledge-item source lifecycle

`yullo_sources` is a temporary implementation table and is not part of the target schema. A `KnowledgeBaseItem` is created when the source is accepted, before indexing, and remains the stable identity across retries and content versions.

| Shared `knowledge_base_items` addition | Type | Rules |
|---|---|---|
| `ingestion_status` | VARCHAR(20) | `queued`, `processing`, `ready`, `failed`, `archived`; existing indexed rows backfill ready. |
| `source_locator` | TEXT nullable | Private durable URL/blob reference; never returned by public/Home APIs. |
| `content_hash` | VARCHAR nullable | Idempotency and change detection. |
| `source_version` | INTEGER | Monotonic version used to reject stale job completion. |
| `published_version` | INTEGER nullable | Version currently authorized for retrieval. |
| `creation_key` | UUID nullable | Idempotent source creation, unique within a Space. |
| `source_metadata` | JSONB | Schema-versioned, redacted adapter metadata. |
| `last_synced_at`, `last_error_code` | TIMESTAMPTZ/TEXT nullable | Current safe lifecycle state. |

Each `IngestionJob` references `(kb_item_id, space_id, kb_id)` and records source version and attempt. Both products reuse the same JobRunner, parsers, chunking, embeddings, vector storage and finalization policy. Yullo differences stay in its authorization/publication service, not in a second ingestion engine.

### `yullo_auras`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID PK | Stable Aura identity. |
| `space_id` | UUID unique FK | Exactly one Aura per Yullo Space. |
| `status` | VARCHAR(20) | `draft`, `preparing`, `ready`, `limited`, `failed`, `paused`. |
| `behavior_config` | JSONB | Tone, verbosity, uncertainty behavior; validated. |
| `capability_config` | JSONB | Explicit allow-list; v1 defaults to Q&A/contact links. |
| `model_config` | JSONB | Logical model role/config; secrets excluded. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Audit timestamps. |

### `yullo_aura_versions`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID PK | Immutable version record. |
| `aura_id`, `space_id` | UUID FKs | Composite ownership validated. |
| `version` | INTEGER | Unique per Aura. |
| `knowledge_version` | INTEGER | Snapshot boundary used by retrieval. |
| `summary` | TEXT nullable | Derived and regeneratable, never source of truth. |
| `starter_prompts` | JSONB | Only questions supported by assigned evidence. |
| `behavior_snapshot` | JSONB | Frozen validated behavior. |
| `capability_snapshot` | JSONB | Frozen capability allow-list. |
| `appearance_recommendation` | JSONB nullable | Recommendation only; owner appearance wins. |
| `status` | VARCHAR(20) | `building`, `preview`, `published`, `superseded`, `failed`. |
| `created_at`, `published_at` | TIMESTAMPTZ | Version timestamps. |

### `yullo_aura_knowledge_assignments`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID PK | Assignment identity. |
| `space_id`, `aura_id`, `kb_id` | UUID | All three must belong to the same Space. |
| `document_ids` | JSONB nullable | Null means the full knowledge group; otherwise explicit documents. |
| `visibility` | VARCHAR(20) | v1 public runtime uses `public`; owner preview may use `draft`. |
| `enabled` | BOOLEAN | Default true. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Audit timestamps. |

### `yullo_space_entities`

This is a strictly typed registry of structured objects owned by a Yullo Space. It is not a document store, generic JSON dump, or replacement for `kb_facts`.

| Column | Type | Rules |
|---|---|---|
| `id` | UUID PK | Entity identity. |
| `space_id` | UUID FK | References `yullo_spaces.space_id`; required. |
| `entity_type` | VARCHAR(30) | `offering`, `location`, `portfolio_item`, `contact_channel`, `person`, `event`, or `action`. |
| `schema_version` | INTEGER | Selects the strict server-owned payload schema. |
| `title` | VARCHAR(300) | Human-readable label. |
| `payload_json` | JSONB | Validated by the schema for `entity_type`; no arbitrary HTML/CSS or unvalidated action URL. |
| `identity_key` | VARCHAR(240) | Stable idempotency key, unique within Space and entity type; never deduplicate by title alone. |
| `origin_type` | VARCHAR(20) | `owner`, `extracted`, or `integration`. |
| `created_by_user_id` | UUID nullable | Audit identity for owner-created entities. |
| `external_provider`, `external_id` | VARCHAR nullable | Stable identity for approved integration records. |
| `review_status` | VARCHAR(30) | `extracted`, `owner_confirmed`, `source_authoritative`, `rejected`, or `superseded`. |
| `visibility` | VARCHAR(20) | `public` or `private`. |
| `status` | VARCHAR(20) | `active` or `archived`. |
| `revision` | INTEGER | Increment on material changes; used for publication-event idempotency. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Audit timestamps. |

Add `UNIQUE(id,space_id)` and `UNIQUE(space_id,entity_type,identity_key)`. Owner-created entities may have no document evidence because the authenticated owner submission is the authority. Model-extracted entities remain unavailable publicly until confirmed, unless an explicitly allowlisted provider is permitted to create `source_authoritative` records.

General facts such as founding year or supported industries remain in `kb_facts`. Files, URLs, raw text and Q&A remain in `knowledge_base_items`. Actual vector chunks and embeddings remain in the shared vector store.

### `yullo_space_entity_evidence`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID PK | Evidence-link identity. |
| `entity_id`, `space_id` | UUID | Composite FK to `yullo_space_entities(id,space_id)`. |
| `kb_id`, `source_item_id`, `source_version` | UUID/UUID/INTEGER | Composite same-Space provenance to the exact shared item version. |
| `evidence_locator_json` | JSONB nullable | Page, section, chunk ID or bounded selector only; no document body, credentials or signed URL. |
| `created_at` | TIMESTAMPTZ | Audit timestamp. |

Enforce `(source_item_id,space_id,kb_id) -> knowledge_base_items(id,space_id,kb_id)` and uniqueness for the same entity/item/version/locator. One entity can have several supporting sources. Only backend command/extraction/integration services may write evidence rows; clients submit evidence candidates, never trusted foreign keys.

### Shared `conversation_turns`

| Column | Type | Rules |
|---|---|---|
| `id` | UUID PK | One attempted request/response operation. |
| `space_id`, `session_id` | UUID | Same-Space relationship to canonical chat session. |
| `client_turn_id`, `request_hash` | UUID/CHAR(64) | Retry idempotency and conflicting-payload detection. |
| `runtime_type`, `runtime_id` | VARCHAR | `aura` plus the concrete runtime identity for Yullo. |
| `runtime_version_id` | UUID nullable | Generic exact runtime version; contains the Aura version UUID when `runtime_type='aura'`. |
| `user_message_id`, `assistant_message_id` | UUID | Canonical log links; assistant is null until completion. |
| `status` | VARCHAR(20) | `accepted`, `generating`, `completed`, `failed`, `interrupted`. |
| `started_at`, `finished_at`, `lease_expires_at` | TIMESTAMPTZ | Operation lifecycle and crash recovery. |
| `error_code` | VARCHAR nullable | Sanitized failure classification. |

Use `conversation_events` for route, intent, evidence IDs, tools, provider/model and latency telemetry. Use `ai_usage_events` for token/cost accounting. The turn table contains operational state only and is reusable by Support247.

### `kb_facts` hardening

Add:

| Column | Type | Purpose |
|---|---|---|
| `value_json` | JSONB nullable | Typed value for deterministic lookup. |
| `review_status` | VARCHAR(30) | `extracted`, `owner_confirmed`, `source_authoritative`, `rejected`, `superseded`. |
| `source_item_id` | UUID nullable | Direct knowledge item provenance. |
| `source_version` | INTEGER nullable | Prevent stale facts from appearing current. |
| `valid_from`, `valid_until` | TIMESTAMPTZ nullable | Time-sensitive facts. |
| `last_verified_at` | TIMESTAMPTZ nullable | Freshness. |
| `superseded_by_id` | UUID nullable | Fact lifecycle. |

Retain `verified` temporarily for compatibility and derive it from approved review states during migration. Mem0 remains optional visitor/session memory and is never queried as authoritative Space truth.

---

## Isolation model

### Database layer

- All tenant-owned shared and Yullo-specific tables carry non-null `space_id` where practical.
- Add `UNIQUE(space_id, id)` on referenced tenant tables to support composite foreign keys.
- Use composite foreign keys such as `(space_id, kb_id) → knowledge_bases(space_id, id)`.
- `yullo_auras.space_id → yullo_spaces.space_id` prevents Support247 Spaces from receiving Aura records.
- Add indexes starting with `space_id` for all public/runtime lookup paths.
- Consider PostgreSQL row-level security after application tests are stable; application scoping remains mandatory even with RLS.

### Application layer

```python
class YulloExecutionContext(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    product: Literal["yullo"] = "yullo"
    space_id: UUID
    aura_id: UUID
    aura_version_id: UUID
    session_id: UUID
    visitor_id: UUID | None = None
    mode: Literal["preview", "published"]
```

The backend constructs this context from authenticated ownership or a public handle. Clients cannot supply `space_id`, `aura_id`, version or retrieval filters as trusted values.

The Yullo context keeps the domain name `aura_version_id`; the shared persistence adapter maps it to `conversation_turns.runtime_version_id`. Do not leak the Yullo-specific name into the neutral table.

Every service accepts the context and every query includes `space_id`. Fetching by an object ID alone is prohibited.

### Retrieval layer

The Yullo retrieval adapter constructs immutable filters:

```text
client_id == context.space_id
AND kb_id/document_id is explicitly assigned to context.aura_id
AND visibility is allowed for context.mode
AND source/item status == ready
AND source_version <= context.aura_version.knowledge_version
```

The visitor, frontend and model cannot widen these filters.

### Future explicit sharing

Document, but do not implement in v1:

```text
entity_share_grants
- source_space_id
- target_space_id
- entity_type
- entity_id
- permission
- status
- granted_by
- created_at
- revoked_at
```

Common user ownership never creates a grant automatically.

---

## Implementation tasks

Repository-state rule for every file list below: paths already present after the latest revert are modified/reviewed, not recreated; absent paths are created. Migration filenames are historical intent, not permission to add a duplicate revision. Inspect the current Alembic head, repair any unapplied candidate in place when safe, and create a new chained revision when the candidate may already have been applied.

### Task 1: Establish product identity and migration safety

**Files:**
- Create: `alembic/versions/0058_add_space_product_identity.py`
- Modify: `app/models/space.py`
- Create: `tests/unit/models/test_space_product_isolation.py`

**Interfaces:**
- Produces: `Space.product: str` and `(product, slug)` uniqueness.
- Consumes: existing `Space`, `User`, authentication and slug routing.

- [ ] **Step 1: Write failing model tests** proving supported product values, rejection of unknown values, duplicate slugs across products, and rejection within one product.
- [ ] **Step 2: Run** `pytest tests/unit/models/test_space_product_isolation.py -v` and confirm failure before implementation.
- [ ] **Step 3: Add the product column and composite uniqueness** while preserving current uncommitted model changes.
- [ ] **Step 4: Write a migration with deterministic backfill.** Existing records default to `support247`; records are not inferred as Yullo from slug. Add an explicit migration query for already-created Yullo drafts based on verified onboarding ownership criteria present at implementation time.
- [ ] **Step 5: Run model tests and migration upgrade/downgrade against a disposable database.**
- [ ] **Step 6: Commit** `feat(yullo): add product-scoped spaces`.

### Task 2: Create the Yullo product module and strict schemas

**Files:**
- Create: `app/yullo/__init__.py`
- Create: `app/yullo/schemas/common.py`
- Create: `app/yullo/schemas/aura.py`
- Create: `app/yullo/schemas/ui.py`
- Create: `app/yullo/schemas/public.py`
- Create: `tests/unit/yullo/test_schemas.py`

**Interfaces:**
- Produces: `YulloExecutionContext`, `AuraBehaviorConfig`, `AuraCapabilityConfig`, `AuraCitation`, `AuraUINode`, `AuraResponse`, `PublicYulloSpace`.
- Consumes: Pydantic v2 and UUID types.

- [ ] **Step 1: Write failing schema tests** for forbidden extras, bounded strings/lists, supported UI node discriminators, and rejection of arbitrary HTML or unknown capability keys.
- [ ] **Step 2: Run** `pytest tests/unit/yullo/test_schemas.py -v` and confirm failure.
- [ ] **Step 3: Implement strict frozen internal schemas** and strict public response schemas with `ui_version=1`.
- [ ] **Step 4: Add semantic configs** with safe defaults: concise answers, admit unknowns, no cross-Space recommendations, Q&A enabled, contact links enabled, write actions disabled.
- [ ] **Step 5: Run tests and commit** `feat(yullo): define Aura contracts`.

### Task 3: Add Yullo Space and Aura persistence

**Files:**
- Create: `app/yullo/models/space.py`
- Create: `app/yullo/models/aura.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/0059_create_yullo_aura_tables.py`
- Create: `tests/unit/yullo/test_aura_models.py`

**Interfaces:**
- Produces: `YulloSpace`, `YulloAura`, `YulloAuraVersion`, `YulloAuraKnowledgeAssignment`, and shared `ConversationTurn` records at runtime.
- Consumes: `Space.product`, knowledge groups and canonical session/message IDs.

- [ ] **Step 1: Write failing persistence tests** for one Aura per Yullo Space, same-Space knowledge assignment, immutable version numbering, and rejection of a Support247 Space.
- [ ] **Step 2: Run the tests and confirm constraint failures.**
- [ ] **Step 3: Implement focused SQLAlchemy models** using the exact columns and states defined above.
- [ ] **Step 4: Implement Alembic tables, indexes and composite constraints.** Add a database constraint trigger that rejects `yullo_spaces` rows whose parent has `spaces.product != 'yullo'`; retain `yullo_spaces` as the foreign-key boundary.
- [ ] **Step 5: Backfill verified Yullo rows** from the existing `spaces` fields into `yullo_spaces`; report ambiguous rows and fail rather than guessing. Keep legacy fields temporarily for compatibility.
- [ ] **Step 6: Run tests and migration checks.**
- [ ] **Step 7: Commit** `feat(yullo): add Aura persistence`.

### Task 4: Reconcile shared document storage before reuse

**Files:**
- Inspect/modify: `alembic/versions/0001_initial.py` only through a new corrective migration, never by editing applied history.
- Inspect: `app/schemas/document.py`
- Inspect: `app/orchestra/ai/knowledge/vector_store.py`
- Create: `docs/YULLO_DOCUMENT_STORAGE_AUDIT.md`
- Create: `tests/unit/yullo/test_document_storage_contract.py`

**Interfaces:**
- Produces: one documented canonical meaning for database `documents`, `knowledge_base_items`, vector `doc_id`, source ID and chunk ID.
- Consumes: existing ingestion output and retrieval citations.

- [ ] **Step 1: Write a contract test** that ingests a small text document and traces source → knowledge item → vector doc/chunks → citation.
- [ ] **Step 2: Run it and record the first broken link.**
- [ ] **Step 3: Document actual ownership and identifiers** including the migration-only `documents` table and whether it is live or legacy.
- [ ] **Step 4: Add only the missing ORM/migration or adapter mapping needed to make the trace complete.** Do not create parallel document/chunk tables.
- [ ] **Step 5: Run the trace test and existing ingestion tests.**
- [ ] **Step 6: Commit** `fix(knowledge): establish canonical document provenance`.

### Task 5: Build Yullo onboarding services with automatic Aura setup

**Files:**
- Create: `app/yullo/services/onboarding/service.py`
- Create: `app/yullo/schemas/onboarding.py`
- Create: `app/yullo/api/onboarding.py`
- Modify: `app/main.py`
- Retire through compatibility wrapper: `app/api/v1/yullo_onboarding.py`
- Retire through re-export or move: `app/schemas/yullo_onboarding.py`
- Create: `tests/unit/yullo/test_onboarding_service.py`
- Create: `tests/api/test_yullo_onboarding.py`

**Interfaces:**
- Produces: `YulloOnboardingService.create_or_update_draft`, `reserve_handle`, `add_source`, `prepare_preview`, `publish`.
- Consumes: `User`, `Space`, `YulloSpace`, `YulloAura` and ingestion adapter.

- [ ] **Step 1: Write failing service tests** for one-tap purpose creation, idempotent draft resume, product-scoped handle reservation, automatic Aura creation and minimal required input.
- [ ] **Step 2: Write API tests** proving callers cannot pass product/Space/Aura IDs to override scope.
- [ ] **Step 3: Implement the service** so Space, YulloSpace and Aura shell are created in one transaction.
- [ ] **Step 4: Move route logic behind the service** while keeping current endpoint shapes temporarily compatible with the uncommitted frontend.
- [ ] **Step 5: Add server-side validation to reservation** so it repeats normalization, reserved-name and collision checks rather than trusting the prior validation call.
- [ ] **Step 6: Run tests and commit** `refactor(yullo): isolate onboarding service`.

### Task 6: Connect onboarding sources to shared ingestion

**Files:**
- Create: `app/orchestra/ai/yullo/knowledge/sources.py`
- Modify: `app/models/knowledge_base.py`
- Modify: `app/models/ingestion_job.py`
- Modify: `app/orchestra/ai/ingestion/jobs/tasks.py`
- Modify: `app/models/space.py` (remove `SpaceSource` after cutover)
- Create: `alembic/versions/0060_migrate_yullo_sources_to_knowledge.py`
- Create: `tests/unit/yullo/test_source_ingestion.py`

**Interfaces:**
- Produces: `SourceService.accept_source`, `retry_source`, `get_status`, `archive_source`, using shared item/job primitives.
- Consumes: existing parsers, scraper registry, chunker, embedding/indexing job runner, `KnowledgeBase`, `KnowledgeBaseItem`, `IngestionJob`.

- [ ] **Step 1: Write failing tests** for pasted text, URL queueing, failure status, deletion, retry and stale-job completion.
- [ ] **Step 2: Run tests and confirm the current `SpaceSource` save-only behavior fails them.**
- [ ] **Step 3: Extend shared items/jobs and migrate Yullo temporary sources.** Create a pending `KnowledgeBaseItem` for every valid Yullo `space_sources`/`yullo_sources` identity, preserve stable legacy IDs as idempotency keys, link attempts, report ambiguous rows and never migrate Support247 rows into Yullo state.
- [ ] **Step 4: Implement SourceService over the existing JobRunner and ingestion pipeline;** extract common orchestration where required and do not fork parsers, chunking or embedding logic.
- [ ] **Step 5: Enforce status semantics:** `queued → processing → ready|limited|failed|removed`; pasted text is not `ready` until indexed.
- [ ] **Step 6: Switch Yullo onboarding reads/writes to shared knowledge items/jobs, verify identity/status/count parity, then remove Yullo use of `SpaceSource` and drop `yullo_sources`.** Preserve `space_sources` only if a verified legacy consumer still requires it.
- [ ] **Step 7: Run Yullo and existing ingestion tests; commit** `feat(yullo): ingest onboarding sources`.

**Implementation update — 2026-09-26:** The shared Yullo ingestion path now processes prose and table-row chunks together, grounds extraction prompts and validation against original source text, preserves multiple values for the same subject/label, normalizes job states, prevents duplicate live-lease execution, and reports indexing separately from fact extraction. Successful empty extraction clears stale machine candidates; extraction failure preserves prior reviewed data and is surfaced separately. Focused extraction and preview-grounding tests pass. Full database-backed ingestion remains to be verified against an isolated test database.

### Task 7: Harden structured facts without using Mem0 as truth

**Files:**
- Modify: `app/models/kb_fact.py`
- Modify: `app/api/v1/facts.py`
- Modify: `app/api/v1/fact_extraction.py`
- Create: `alembic/versions/0061_harden_kb_facts.py`
- Create: `app/yullo/adapters/facts.py`
- Create: `tests/unit/yullo/test_fact_authority.py`

**Interfaces:**
- Produces: `YulloFactRepository.get_authoritative_facts(context, query)` and safe fact lifecycle.
- Consumes: `KBFact`, `KnowledgeBaseItem`, source provenance and `YulloExecutionContext`.

- [ ] **Step 1: Write failing authorization tests** proving a fact/document cannot be read, committed, replaced or deleted through another Space or knowledge group.
- [ ] **Step 2: Write lifecycle tests** proving extracted facts are invisible as authoritative until owner-confirmed or source-authoritative, and superseded/expired facts are excluded.
- [ ] **Step 3: Add the hardening columns and composite constraints.**
- [ ] **Step 4: Fix commit/delete queries** to include `space_id`, `kb_id`, source item and source version.
- [ ] **Step 5: Implement the Yullo adapter.** Mem0 is excluded from Space-fact lookup and may remain disabled for Aura v1.
- [ ] **Step 6: Run fact, authorization and migration tests; commit** `fix(knowledge): harden facts for shared products`.

### Task 8: Implement publication-aware Aura retrieval

**Files:**
- Create: `app/yullo/adapters/retrieval.py`
- Create: `app/orchestra/ai/yullo/knowledge/retriever.py`
- Modify only if necessary: `app/orchestra/ai/knowledge/agno_chroma.py`
- Create: `tests/unit/yullo/test_retrieval_isolation.py`

**Interfaces:**
- Produces: `YulloRetriever.retrieve(context, query, limit) -> EvidencePack`.
- Consumes: current knowledge backend, Aura assignments, facts and published version.

- [ ] **Step 1: Write a two-product/two-Space test fixture** with overlapping terms, identical document titles and different answers.
- [ ] **Step 2: Write failing tests** proving exact Space isolation, Aura assignment filtering, preview/published visibility and version cutoff.
- [ ] **Step 3: Implement backend-owned filter composition.** Never accept raw client filters.
- [ ] **Step 4: Merge structured facts with passages into an `EvidencePack`** that records source/item/chunk identifiers and authority.
- [ ] **Step 5: Add an evidence sufficiency result:** `supported`, `missing`, or `conflicting`.
- [ ] **Step 6: Run Yullo isolation and existing Support247 knowledge tests to prove no assignment regression.**
- [ ] **Step 7: Commit** `feat(yullo): add isolated Aura retrieval`.

### Task 9: Generalize canonical conversations without importing Support247 behavior

**Files:**
- Modify: `app/models/chat.py`
- Modify: `app/models/space.py` (`ConversationLog` only)
- Modify: `app/models/conversation_event.py`
- Create: `alembic/versions/0062_add_runtime_identity_to_chat.py`
- Create: `app/yullo/adapters/conversations.py`
- Create: `tests/unit/yullo/test_conversation_isolation.py`

**Interfaces:**
- Produces: `YulloConversationRepository.start`, `append_user`, `append_aura`, `history`.
- Consumes: canonical `ChatSession` and `ConversationLog`.

- [ ] **Step 1: Write failing tests** proving Aura conversations use one Space/Aura, reject foreign session IDs, and never load Support247 sessions.
- [ ] **Step 2: Add `product`, `runtime_type`, and `runtime_id`** to sessions/events. `runtime_type` is `chatbot|aura`; `runtime_id` is required for new records.
- [ ] **Step 3: Keep `chatbot_id` nullable** and leave Support247-specific escalation fields null for Yullo.
- [ ] **Step 4: Validate citations/UI blocks before persistence.**
- [ ] **Step 5: Run existing customer-chat tests and new isolation tests.**
- [ ] **Step 6: Commit** `refactor(chat): support isolated Aura conversations`.

### Task 10: Build the single Aura runtime and grounding gate

**Files:**
- Create: `app/yullo/services/aura/runtime.py`
- Create: `app/yullo/services/aura/context.py`
- Create: `app/yullo/services/aura/prompt.py`
- Create: `app/yullo/services/aura/validator.py`
- Create: `app/yullo/adapters/models.py`
- Create: `tests/unit/yullo/test_aura_runtime.py`

**Interfaces:**
- Produces: `AuraRuntime.run(context, message) -> AuraResponse` and streaming event adapter.
- Consumes: retriever, fact repository, conversation repository, shared LLM/provider factory and usage recorder.

- [ ] **Step 1: Write failing behavior tests** for supported answer, missing evidence, conflicting evidence, prompt injection inside a source, foreign entity ID and model failure.
- [ ] **Step 2: Implement deterministic routing first** for identity/contact values that exist as structured records.
- [ ] **Step 3: Implement retrieval path** with a compact evidence pack and low-temperature configured model.
- [ ] **Step 4: Implement the grounding gate:** missing/conflicting evidence bypasses factual generation and produces a controlled limitation or clarification.
- [ ] **Step 5: Validate every citation and UI entity against the context before returning or storing it.**
- [ ] **Step 6: Record shared `ConversationTurn`, `ConversationLog`, `ConversationEvent`, and `AiUsageEvent` without storing internal chain-of-thought.**
- [ ] **Step 7: Run tests and commit** `feat(yullo): implement grounded Aura runtime`.

### Task 11: Generate and publish a real Aura preview

**Files:**
- Create: `app/yullo/services/publishing/builder.py`
- Create: `app/yullo/services/publishing/publisher.py`
- Create: `tests/unit/yullo/test_publication.py`
- Modify: `app/yullo/api/onboarding.py`

**Interfaces:**
- Produces: `build_preview(space_id, expected_context_version)` and `publish_preview(space_id, version)`.
- Consumes: ready sources, Aura configs, assigned knowledge, runtime and version tables.

- [ ] **Step 1: Write failing tests** for preview from indexed content, supported starter prompts, limited Aura, stale build completion and atomic publish.
- [ ] **Step 2: Build summary and prompts as derived artifacts** tied to a knowledge version. Reject prompts that cannot retrieve supporting evidence.
- [ ] **Step 3: Use compare-and-set version checks** so an older background job cannot overwrite newer source changes.
- [ ] **Step 4: Publish in one transaction** by marking the selected version published and updating `yullo_spaces.published_version`.
- [ ] **Step 5: Ensure owner appearance overrides survive regeneration.**
- [ ] **Step 6: Run tests and commit** `feat(yullo): add preview and publication`.

### Task 12: Add public Yullo APIs and streaming

**Files:**
- Create: `app/yullo/api/public.py`
- Modify: `app/main.py`
- Create: `tests/api/test_yullo_public_api.py`

**Interfaces:**
- Produces: `GET /api/v1/yullo/public/spaces/{handle}`, `POST .../conversations`, `POST .../messages` stream.
- Consumes: published Space lookup, Aura runtime and conversation repository.

- [ ] **Step 1: Write API tests** for product-scoped handle lookup, unpublished Space 404, anonymous session creation, foreign session rejection and grounded streaming.
- [ ] **Step 2: Implement public Space endpoint** with no LLM call on page load.
- [ ] **Step 3: Implement conversation start** bound to the current published Aura version.
- [ ] **Step 4: Stream the existing event vocabulary** (`message.start`, `text.delta`, `ui.add`, `followups`, `message.done`, `error`) with validated payloads.
- [ ] **Step 5: Add bounded input size, rate-limit hooks and sanitized errors.**
- [ ] **Step 6: Run API tests and commit** `feat(yullo): expose public Aura API`.

### Task 13: Replace the mock frontend provider and isolate local routing

**Files:**
- Move: `ui/src/services/aura/` → `ui/src/yullo/services/aura/`
- Move: `ui/src/hooks/useAuraChat.ts` → `ui/src/yullo/hooks/useAuraChat.ts`
- Move: `ui/src/api/yullo_onboarding.ts` → `ui/src/yullo/api/onboarding.ts`
- Move: `ui/src/config/yullo.ts` → `ui/src/yullo/config/index.ts`
- Move: `ui/src/screens/yullo/` → `ui/src/yullo/screens/`
- Move: `ui/src/components/yullo/` → `ui/src/yullo/components/`
- Create: `ui/src/yullo/services/aura/ApiAuraProvider.ts`
- Modify: `ui/src/yullo/services/aura/index.ts`
- Modify: `ui/src/yullo/services/aura/types.ts`
- Modify: `ui/src/yullo/hooks/useAuraChat.ts`
- Modify: `ui/src/SlugResolver.tsx`
- Modify: `ui/src/App.tsx`
- Create: `ui/src/yullo/services/aura/ApiAuraProvider.test.ts`
- Create: `ui/src/SlugResolver.test.tsx`

**Interfaces:**
- Produces: isolated Yullo frontend module, real API-backed `AuraProvider`, and explicit local product routes.
- Consumes: Yullo public APIs and current Aura UI components.

- [ ] **Step 1: Write import-boundary tests** proving Yullo modules cannot import Support247 screens, chatbot services or render blocks, and Support247 modules cannot import from `ui/src/yullo/`.
- [ ] **Step 2: Move the existing Yullo frontend as one mechanical change** and update imports without changing behavior. Keep root `App.tsx` and `SlugResolver.tsx` as product selectors only.
- [ ] **Step 3: Write failing provider tests** for public Space load, session creation, streaming, errors and unknown UI nodes.
- [ ] **Step 4: Implement `ApiAuraProvider`** inside the Yullo module and inject it from the Yullo entry boundary; do not expose a process-wide singleton used by both products. Keep `MockAuraProvider` available only through explicit Yullo development/test configuration.
- [ ] **Step 5: Key all browser state by product and Space** using `yullo:{handle}:...` keys. Reset conversation ID, messages and pending streams when the handle changes; never read Support247 storage keys.
- [ ] **Step 6: Add explicit localhost routes:** `/yullo/:handle` and `/support247/:slug`; production uses configured hostnames. Remove implicit “everything is Yullo” behavior.
- [ ] **Step 7: Run frontend tests and build; commit** `refactor(yullo-ui): isolate product frontend`.

### Task 14: Make Yullo generative UI entity-backed

**Files:**
- Create: `app/yullo/models/entity.py`
- Create: `app/yullo/schemas/entities.py`
- Create: `app/yullo/services/entities/service.py`
- Create: `app/yullo/services/entities/extraction.py`
- Create: a chained Alembic expand/migrate revision for entities/evidence and provisional-table cutover
- Replace: provisional `app/api/v1/yullo_resources.py` with Yullo entity commands/routes
- Modify: `app/yullo/api/public.py`
- Modify: `ui/src/yullo/services/aura/types.ts`
- Modify: `ui/src/yullo/components/generative-ui/AuraRenderer.tsx`
- Replace placeholder data in: `ui/src/yullo/components/generative-ui/cards/*.tsx`
- Create: `ui/src/yullo/components/generative-ui/AuraRenderer.test.tsx`

**Interfaces:**
- Produces: strict entity/evidence persistence, owner/extraction/integration write boundaries, and validated renderers for `offering`, `portfolio_item`, `location`, `contact_channel`, `person`, `event`, and `action` nodes.
- Consumes: shared knowledge-item provenance, published Space context, and `AuraUINode` with entity IDs.

- [ ] **Step 1: Write failing tests** proving cards render authoritative fetched data, unknown node types fail closed, and a foreign entity returns no card.
- [ ] **Step 2: Create the strict entity/evidence models and schemas.** Enforce composite same-Space FKs and type-specific payload validation; keep facts and source bodies out of these tables.
- [ ] **Step 3: Implement the three controlled producers:** owner commands, post-ingestion extracted candidates requiring confirmation, and allowlisted provider adapters. No model or browser writes directly to persistence.
- [ ] **Step 4: Migrate valid provisional `yullo_resources` rows, create evidence links, switch readers/writers, verify counts/payloads, and drop the old table only in the later contract phase.**
- [ ] **Step 5: Remove static Northstar placeholders and resolve entities through product/Space-scoped endpoints; stream only validated entity IDs.**
- [ ] **Step 6: Keep Support247 render table/card/tab code unchanged.**
- [ ] **Step 7: Run tests and commit** `feat(yullo-ui): render authoritative Space entities`.

### Task 15: Reuse evaluations for strict no-guess behavior

**Files:**
- Modify: `app/models/evaluation.py`
- Modify: `app/schemas/evaluation.py`
- Modify: `app/services/evaluation_runner.py`
- Create: `tests/unit/yullo/test_aura_evaluations.py`

**Interfaces:**
- Produces: Aura evaluation target and grounding checks.
- Consumes: published/draft Aura runtime, citations and evidence.

- [ ] **Step 1: Add runtime target identity** without requiring a Support247 chatbot.
- [ ] **Step 2: Add deterministic expectations:** required citation, allowed source IDs, unknown-answer behavior, forbidden unsupported claims and expected UI entity IDs.
- [ ] **Step 3: Create fixtures for cross-Space leakage, missing data, conflicting price/date, prompt injection, stale publication and invalid entity ID.**
- [ ] **Step 4: Run the complete evaluation and existing Support247 evaluation suites.**
- [ ] **Step 5: Make the critical isolation/grounding suite a publication gate.**
- [ ] **Step 6: Commit** `test(yullo): enforce Aura grounding evaluations`.

### Task 16: Add operational controls and final verification

**Files:**
- Modify: `app/config.py` only for logical Yullo defaults and feature flags.
- Modify: `app/yullo/adapters/usage.py`
- Create: `alembic/versions/0063_remove_legacy_yullo_space_fields.py`
- Create: `docs/YULLO_AURA_OPERATIONS.md`
- Create: `tests/api/test_yullo_support247_regression.py`

**Interfaces:**
- Produces: release checklist, usage visibility and rollback controls.
- Consumes: shared provider priority, `ai_usage_events`, Aura versions and feature flags.

- [ ] **Step 1: Add config validation** for provider/model roles, retrieval limits, response limits and feature flags. Keep secrets in environment-backed settings.
- [ ] **Step 2: Verify usage records** contain product, Space, Aura run, provider, model, tokens, latency and success/failure without sensitive content.
- [ ] **Step 3: Add regression tests** proving Support247 routes, knowledge assignments, chatbot sessions and render blocks remain unchanged.
- [ ] **Step 4: Add the contract migration** only after repository-wide checks prove no runtime reference remains. Drop `spaces.purpose`, `spaces.current_step`, `spaces.context_version`, `spaces.preview_context_version`, `spaces.handle_reserved_until`, the Yullo meaning of `spaces.status`, and `space_sources`. Retire user-level `onboarding_completed` once all callers use per-Space Yullo state.
- [ ] **Step 5: Run backend unit/API tests, frontend tests/build, and Alembic upgrade/downgrade on a disposable database.**
- [ ] **Step 6: Perform manual acceptance:** onboard two Yullo Spaces and one Support247 Space with deliberately conflicting facts; verify zero cross-answer leakage and honest unknown behavior.
- [ ] **Step 7: Document rollback:** disable public Aura, retain published data, preserve Support247, and roll back to the previous Aura version without deleting conversations.
- [ ] **Step 8: Commit** `docs(yullo): add Aura operations and release checks`.

---

## Milestones and release order

### Milestone 1: Grounded text-only vertical slice

Tasks 1–12 with pasted text as the first supported source. Completion means an owner can create a Yullo Space, add text, preview it, publish it, and receive cited public answers or honest unknown responses.

### Milestone 2: Real frontend and entity UI

Tasks 13–14. Completion means the mock provider and static cards are removed from production behavior and localhost routes explicitly separate products.

### Milestone 3: Quality gate and operations

Tasks 15–16. Completion means cross-Space leakage and unsupported claims are tested as release-blocking failures.

After the vertical slice is stable, enable website ingestion, then document upload, then supported social adapters through the same source interface. Contact forms and other deterministic actions require a separate approved plan. Booking, payment, multi-agent orchestration and root/user Aura remain future work.

## Acceptance criteria

- A user can own multiple Yullo and Support247 Spaces without implicit sharing.
- The same slug may exist once per product.
- A Yullo Aura cannot be created for a Support247 Space.
- Aura cannot retrieve another Space's knowledge even when IDs are guessed.
- Support247 knowledge assignments continue working.
- Preview and public chat use the same Aura runtime with different version visibility.
- Page load requires no LLM call.
- Every factual public answer has validated evidence or deterministic tool output.
- Missing or conflicting evidence produces clarification or a limitation, never a guess.
- Generated UI references only eligible authoritative entities in the current Space.
- Source deletion and republishing remove the source from new public answers.
- Stale ingestion or preview jobs cannot overwrite newer versions.
- Model/provider changes require configuration changes, not Aura code changes.
- Existing Support247 routes, chatbot behavior and UI rendering pass regression tests.

## Explicitly deferred

- Root/user Aura and cross-Space delegation.
- Persistent visitor personalization with Mem0.
- Cross-product entity-sharing grants.
- Booking, payment and ticket state machines.
- General action workflow builder.
- Multi-agent Aura hierarchy.
- Automatic web discovery beyond owner-submitted sources.

These features require separate plans after grounding, permissions, provenance and evaluations demonstrate production maturity.

## Chat readiness audit — 2026-10-20

Status: not ready for production sign-off. Review only; no runtime or endpoint changes.

Confirmed findings:
- `AuraMessage.tsx` renders plain text, not Markdown, and never displays collected citations. Markdown links/images, tables and code fences therefore remain literal text.
- Rich UI supports service, location, portfolio and actions. Portfolio renders the first stored media URL; there is no image-generation tool in the Aura inference runtime and no explicit capability guidance in its prompt.
- `HttpAuraProvider.ts` treats stream EOF as completion without requiring `message.done`; malformed intermediate events are logged and skipped.
- `useAuraChat.ts` clears `isTyping` on `message.start`, re-enabling the composer during generation; there is no in-flight guard in `runMessage`.
- `generate_validated_answer` ignores error events and always reports sufficiency as supported, including empty or partial responses.
- The three-line inference prompt provides grounding instructions but no tone, follow-up or unsupported image-request guidance. Engagement remains unverified without live model evaluations.
- Cards return null when entity fetching fails; portfolio images have no load-error fallback.

Verification:
- Three focused frontend tests passed (SSE parsing/error handling and inline service rendering); frontend TypeScript check passed.
- Focused backend run: three passed, one failed. Manifest test fixture lacks `field_policies`; this is a fixture mismatch, not proof that real entity rendering fails.
- Five database-dependent isolation checks errored during setup; no isolation pass is claimed. Do not rerun against a configured database without first establishing an isolated test database.
- Initial backend collection required a process-local `DEBUG=false` override because inherited DEBUG was `release`.
- No live model conversation, browser visual review, production build or end-to-end image/card retrieval was verified.

Pending: safe Markdown/media rendering and visible citations; explicit stream completion and in-flight locking; truthful generation failure/sufficiency handling; capability-aware response guidance; all-card and image-failure coverage; isolated integration and real-model quality evaluation before release.


## Chat-only implementation follow-up — 2026-10-20

Approved scope: public chat KB resolution, published-version alignment, and extracted source-image context/rendering. No appearance, Space editing/management, ingestion, schema migration, production-data, commit or deployment changes.

Implemented:
- Public chat replaces caller KB selections with the current Space's active Yullo KB IDs. The retriever independently intersects explicit KB subsets with authorized Space KBs and includes verified facts through the existing fact service.
- Passage scope now requires ready, confirmed sources with a published revision and builds document IDs from `published_version`. Returned vector hits are checked against document and Space metadata.
- `chat_sources.py` shares the published-source boundary between retrieval and image resolution; `chat_images.py` associates extracted image captions with vector-retrieved documents and ranks against the question and retrieved chunk text. Model context is bounded and contains IDs/captions, not image URLs.
- The `show_source_images` tool accepts only retrieved IDs. `GET /api/v1/yullo/public/spaces/{space_id}/aura/images/{image_id}` rechecks the live Space and published source before resolving a source/version/Space-bound ID. Source deletion, unconfirmation or metadata revision changes invalidate it.
- `SourceImagesCard` renders the selected images within chat, with source labels, fresh lookup, retry and image-load fallback. HTTP stream validation accepts only well-formed image references.
- Configuration: `YULLO_CHAT_MAX_CONTEXT_IMAGES` (default 6), `YULLO_CHAT_MAX_GALLERY_IMAGES` (default 4), `YULLO_CHAT_MAX_IMAGE_CAPTION_CHARACTERS` (default 400), validated in chat-only inference config.
- Earlier P0/P1 response work is implemented: completion/error handling, in-flight send protection, safe Markdown, retrieved-reference disclosure, card errors/retries, and capability-aware prompt guidance.

Verification: focused backend and frontend tests cover KB scoping, published vs draft revisions, wrong-Space vector hits, verified facts, image selection, invalid references, unconfirmation, model/tool context, chat rendering, streaming errors and retry behavior. TypeScript and production build pass. Test dependencies are mocked; no live database or index writes were performed.

Limitations: source images need existing extracted caption/context metadata. This reuses document vector search followed by caption matching; it does not create a separate image-embedding index or run image understanding. Image metadata is withheld if its current revision differs from the published revision. Live-provider/browser acceptance and isolated real-index/database integration remain unverified.


### Greeting/product presentation correction — 2026-10-20

- Greeting-only and small-talk messages bypass retrieval and model generation, returning a concise greeting without product cards or citations. Mixed messages such as “hi, show jeans” still retrieve normally.
- Chat prompt now prioritizes the current request over retrieved products and previous conversation topics; product/service cards are preferred when verified entities exist.
- Streaming presentation converts Markdown image URLs that exactly match retrieved authorized images into source-image card references; unknown images never become browser requests. Ordinary text/links continue streaming, and fenced/inline code examples remain code.
- Source-image cards now show a short title and a verified source-page link when source metadata supplies one. The old “preview unavailable” inline placeholder is removed.
- Changes are chat-only. No appearance, ingestion, Space management, deployment or data changes.
- Verification: greeting tests include the reported “hi” and “Whats up?” after jeans history; mocked model tests exercise split Markdown image conversion and preserved links; frontend tests verify visible image/title/source link. Focused tests and production build pass; live-provider/browser verification remains pending.

### Chat card grid correction — 2026-10-20

- `AuraMessage.tsx` groups all response cards into one responsive grid, flattening separate source-image tool responses into sibling cards instead of stacking individual galleries. One column on phones, two at `sm`, three at `lg`; action rows span the grid.
- `SourceImagesCard.tsx` uses compact 4:3 image frames with contained images, equal-height cards, two-line titles/descriptions and a short “View source” link. Full source name remains the link's accessible label.
- Chat presentation only; no retrieval, appearance or Space-management changes.
- Verification: seven focused rendering tests passed; production build checked. Browser visual verification remains pending.

### Chat image relevance/link correction — 2026-10-20

- User clarified the images loaded but contained delivery/returns promotional text; no loading behavior changes retained.
- Image selection now requires query-term overlap with the image's own alt/title/caption rather than broad page context. Explicit audience terms (women/men/kids/children) must match the image description. Known delivery/returns/payment/logo/placeholder metadata is excluded.
- Chat image destinations use explicit attached links, exact nested Markdown image links, or links with an exact image_url association. Otherwise the source page remains the destination and UI labels it “Visit <domain>”; no product URL is guessed.
- Focused source-context/presentation tests: 28 passed; frontend rendering tests: 7 passed; production build passed.
- Limitation: filtering is metadata-based. No pixel OCR/vision added, and the specific live images were not fetched/visually classified. Existing saved responses are not rewritten.

### Markdown chunk asset preservation — 2026-10-24

- Markdown now uses a dedicated content-block strategy. It embeds clean titles/descriptions while storing local links and linked-image relationships as `links_json` and `images_json` chunk metadata.
- Blocks merge only within the same heading when they share an explicit non-navigation destination, or when they are adjacent plain prose. URLs no longer consume embedding/chunk space.
- High-confidence carousel, video-loading and dialog-control blocks are removed. Ambiguous controls are removed only with adjacent structural context to limit false positives.
- Chat image selection prefers the exact images attached to retrieved chunks and retains the legacy caption matcher only for old indexes without image metadata.
- The public image resolver revalidates the published chunk association before returning an item destination. If the same image maps to multiple destinations, it keeps the source fallback instead of guessing.
- Existing indexed sources require re-indexing before they gain the new metadata. Focused tests were not run per the user's existing instruction to skip tests.

### Delivery/returns graphics clarification

- Retain eligible source graphics for delivery/returns; exclude them from ordinary product suggestions at query selection time.
- Include a matching graphic only when the query explicitly mentions delivery, shipping, returns or refunds. Public source authorization and image-reference resolution remain unchanged.
- Updated chat prompt and added six request-specific cases; 22 source-context tests pass. No UI/appearance/ingestion changes in this follow-up.

### Common chat prompt composition — updated 2026-11-10

The former category/intent keyword selector is removed. This supersedes its earlier implementation and verification notes; those old classifier checks do not validate the current behavior.

Current implementation:
- `app/yullo/prompts/base.py`: common evidence, comparison/recommendation/policy and presentation constraints. Preserves distinctions between items/categories/listings/services, price basis, availability, source provenance and safe image destinations without selecting a domain-specific prompt.
- `app/yullo/prompts/composer.py`: combines common instructions, approved Space identity as data, and actually available tools. No domain/intent dispatch.
- `app/yullo/schemas/inference.py`: validated SpaceChatProfile, moved unchanged from the removed classifier.
- `app/yullo/services/inference/runtime.py`: existing read-only Space/product/publication-scoped profile loading and category provenance checks; the former `context.py` loader was consolidated here on 2026-11-10.
- `app/orchestra/ai/knowledge/base.py:prepare_retrieval_query`: bounded visitor-only context for referential retrieval queries. This English-language heuristic is separate from prompt/tool selection and does not establish factual authority or fully resolve ambiguous references.
- `app/yullo/services/inference/runtime.py`: greeting bypass, contextual retrieval, common prompt, authorized tools and shared Agno execution. Removed intent-based image suppression; existing image relevance/authorization validators remain.

Deleted the obsolete classifier and its orphaned domain/intent prompt modules. Updated existing fixtures to the common prompt contract and retained follow-up/scoping checks; no new test cases added. Static syntax, reference and focused lint checks only; runtime tests/model calls remain skipped under the owner's standing instruction. No appearance, ingestion, database schema or source-publication behavior changed.

Quality comparison has not been executed. Use the same indexed sources, questions, history, model and retrieval budgets for before/after comparisons. Cover exact product links, price conditions, policies, unrelated-topic changes, pronoun follow-ups, relevant/irrelevant images and absent evidence. Inspect extracted records, retrieved evidence and final answers separately so extraction/retrieval failures are not mistaken for prompt failures. Measure grounded answer correctness, source/link correctness, follow-up resolution, unnecessary tool calls, latency and token usage. Test a semantic query rewrite only if referential retrieval remains a demonstrated failure; do not add a classifier call without a measured benefit.


### Simplify chat retrieval context — 2026-10-24

Implemented the approved top-N retrieval simplification without adding extraction or model calls.
- `app/yullo/schemas/retrieval.py`: `RetrievedContext` is the active in-memory return model; `EvidencePack` remains an alias for existing callers/tests, not another data layer.
- `app/orchestra/ai/yullo/knowledge/retriever.py`: retained published, Space-scoped vector search; private sources are excluded from passage lookup, and the result limit applies after stale/foreign hits are rejected. Source identity is attached to passages. Removed the page-wide generic category-link scan. Links now come from returned chunk metadata and selected image destinations, with URL validation, deduplication and a global cap of ten.
- `app/orchestra/ai/yullo/knowledge/chat_images.py`: removed word-overlap destination guessing; explicit associations remain, otherwise the source-page fallback is retained.
- `app/yullo/services/inference/runtime.py`: consumes the renamed context and a single collected link list; passage citations use the actual source location rather than the first outbound link.
- Preserved approved fact/contact retrieval, image relevance filters, prompt routing, entity cards, publication checks, provider fallback and streaming. Existing facts are still supplemental context; their database lookups have not been removed or relevance-filtered in this change.
- No frontend, ingestion, endpoint, migration or production-data changes. Existing malformed/missing chunk link metadata still requires a separate ingestion repair; this change does not reconstruct it.

Verification: Python AST syntax checks passed for all four changed modules. No new tests added. Existing focused test execution is awaiting user approval per AGENTS.md. Full-worktree whitespace inspection found pre-existing issues outside the changed modules; the task-scoped diff whitespace check passed. Live Amazon/browser integration remains unverified.


### Image/link association repair — 2026-10-24

Scope: generic image and destination correctness; reported Space `amazonin`. No category-specific retrieval rules or additional LLM calls introduced.
- Added neutral `app/orchestra/ai/ingestion/parsers/markdown_links.py` using the existing markdown-it-py dependency. Parses actual image/anchor relationships, reference links, balanced destinations and headings; code examples are not treated as assets.
- `app/yullo/services/sources/asset_extractor.py`: uses parsed blocks, retains heading/category paths, resolves relative destinations, enforces the image cap across the document, and enriches a repeated image with its explicit destination. Added quick/rendered asset merge by URL.
- `app/orchestra/ai/ingestion/pipeline.py`: chunk links now contain actual anchor destinations rather than image URLs captured by the old regex. Original source text and fact-extraction inputs remain unchanged.
- `app/orchestra/ai/ingestion/scraper/service.py`: merge rendered assets with quick-fetch assets; parse rendered Markdown versus HTML by returned format and resolve relative links against the final URL.
- `app/orchestra/ai/yullo/knowledge/chat_images.py`: resolve stored Markdown image associations with the same parser; reject self-image destinations and restricted link associations.
- `ui/src/yullo/components/generative-ui/cards/SourceImagesCard.tsx`: attached links use the neutral “View details” label; accessible labels include the displayed image title.

Reported-response diagnosis:
- The exact request was `Show images of Cotton bedsheets and Kurta`.
- Read-only inspection found one ready/published `amazonin` source. Bedsheets has a verified category destination in source metadata, but that association was absent from its vector chunk. No Kurta link or Kurta image exists in the current published source metadata. The only image among the first 12 with a matching destination shown in the faulty response was the unrelated 8PM deal.
- `app/orchestra/ai/yullo/knowledge/retriever.py` now rejoins links from the same published source only when the link's own visible title/context occurs in a retrieved passage. This recovers the existing Bedsheets destination without restoring page-wide navigation links.
- Source image collection now ignores common logo/sprite assets, understands common lazy-image attributes, and retains up to 48 bounded candidates before chat relevance selection. The larger candidate pool is category-neutral and is not sent wholesale to the model.
- The base presentation contract requires descriptive linked item labels and requires the assistant to disclose a missing requested image/destination instead of presenting an unrelated item.

Verification: read-only database and conversation inspection completed; no database writes occurred. Python AST syntax and task-scoped whitespace checks passed. Existing tests were explicitly skipped at user request; no new tests added. No re-ingestion, publication, commit or deployment performed. Existing `amazonin` metadata must be refreshed through the normal review/publication flow before newly captured Bedsheets/Kurta imagery can appear. Kurta must remain unavailable until a source supplies its image/link.


### Conditional chunk continuation — 2026-11-09 (implemented; runtime verification skipped)

Approved scope: expose validated same-group continuation metadata to the first answer call; allow one bounded expansion round only when requested. Centralize chat fact/chunk/continuation switches and isolate feature functions. Keep ingestion extraction, review, publication, UI tools and provider fallback working.

Implementation: config/inference.py owns switches and caps; knowledge/retriever.py coordinates facts and chunks; knowledge/continuations.py owns validation and expansion; knowledge backend provides optional exact chunk reads; inference/runtime.py owns the two-round model interaction. Defaults preserve existing features.

Verification: static syntax/lint/diff checks only. User explicitly requested skipping runtime tests. No new tests, database writes, migrations or model calls.

Completed:
- `app/yullo/config/inference.py:get_knowledge_features` is the single validated switchboard. Comment the enabled keyword line (its schema default is false), or set the matching environment variable to false: chat facts, chat chunks, continuations, ingestion facts, ingestion entities. All remain enabled by default; existing entity master setting is respected. Indexing/chunk construction remains mandatory for ingestion because the extractors consume stored chunks. Support247 extraction behavior is unchanged.
- `knowledge/retriever.py:retrieve` coordinates `_retrieve_facts`, `_retrieve_chunks`, asset selection and continuation discovery. `ingestion/orchestration.py:_extract_ingested_knowledge` contains the ingestion extraction/reuse step. Disabled extraction returns no replacement data and records disabled status, preserving existing review candidates/approved data; disabling both extraction features skips the extraction model and chunk-read work.
- `knowledge/continuations.py:prepare_continuations` is synchronous and builds advertised IDs from retrieved chunk metadata only; no preliminary database/backend reads. Context includes document-local chunk/group indices and navigation IDs. Missing or malformed seed metadata exposes no link; already retrieved fragments are recognized locally. The expansion fetch validates target existence and reciprocal same-group/document/Space links. Missing targets or unsupported backends return unavailable without further hunting.
- Expansion rechecks current active KB authorization, publication/version and public visibility, refreshes source ORM state, consumes a request-local allowlist, deduplicates chunk identities and caps complete fragment payloads at two chunks / 2048 cl100k_base tokens by default. No arbitrary indices, cross-document/group traversal or recursive sibling loading. Unknown metadata is not treated as proof of answer completeness.
- `inference/runtime.py` supplies navigation status to the first answer call. No eligible links or a direct answer uses one generation attempt. A requested expansion uses one final generation attempt with expansion removed; provider fallback cannot reopen it. Initial text is buffered only while expansion is available, so speculative text is discarded. Existing UI/image calls remain validated and deferred calls are retained/deduplicated. Usage estimates include both rounds and tool-call output. Expansion citations are added for returned passages.
- No frontend/endpoints, migrations, durable writes, re-ingestion or model requests performed by this task.

Verification: all 11 touched Python modules passed AST parsing and focused Ruff syntax/undefined-name rules. Task-scoped whitespace check passed after cleanup. Broader Ruff F checks identify the same five pre-existing ingestion orchestration findings as HEAD (unused imports and job shadowing); these are outside this change. Runtime tests remain explicitly skipped; no new tests written.

Pending: runtime/integration verification and any desired normal re-ingestion of old sources to populate links. Approved-fact relevance selection and the existing ingestion reuse path that skips fresh entity extraction when facts already exist remain unchanged. Structural fragment links cannot certify semantic answer completeness. Provider failures may add fallback attempts; only one expansion round is allowed.


Continuation simplification follow-up (2026-11-09): removed preliminary neighbor metadata reads; updated the retriever to call the synchronous metadata formatter. Publication/Space/group validation remains at the requested content fetch, together with single-use IDs and existing expansion budgets. No ingestion or persisted metadata changes. Static AST/Ruff and whitespace checks passed; runtime tests remain skipped by user instruction.


### Contact query DB-layer separation — 2026-11-09

Completed: moved the contact entity/evidence/source join from `knowledge/retriever.py` into `knowledge/retrieval.py:get_published_contact_evidence`, alongside existing authoritative fact queries. The retriever calls this query function and retains payload projection, confirmation/disclosure checks, deduplication and context formatting. All original SQL predicates (public entity rules, Space, KB, source readiness and published evidence version) remain unchanged. Empty KB input returns no rows. No new repository abstraction, endpoints, migrations or database writes.

Verification: AST parsing, focused Ruff checks and task-scoped whitespace checks passed. Runtime tests remain skipped by the user's existing instruction; no tests added.

### Public chat URL session selection — 2026-11-11

Completed:
- `ui/src/yullo/hooks/useAuraChat.ts`: a public URL without `?chat=` starts with empty messages and no active session. The first successful session creation replaces the URL with `?chat=<session-id>`, preserving other query parameters, the hash and browser history state. Refreshing that URL selects the same session.
- Browser message caches are keyed by Space ID and conversation ID. Old handle-based caches are read only when their saved session ID matches the explicit URL ID; existing caches and database chats are not deleted. Streaming/error recovery and retry behavior remain in place. Preview mode still avoids persistence and network calls.
- `ui/src/yullo/screens/public/PublicYulloLink.tsx`: key the public experience by Space identity so navigating to another Space cannot retain the previous Space's hook state.
- Adapted the existing interrupted-reply hook test fixture to provide an explicit URL session ID. No additional test cases, endpoints, migrations or database writes.

Verification: frontend `npm run type-check` and task-scoped `git diff --check` passed. User explicitly requested skipping tests; no runtime tests run. Browser/live integration remains unverified.

Pending: backend history hydration when the requested session has no browser cache, a previous-conversation picker/New chat control, and committing incoming user messages before generation. These are outside this URL-selection fix; a URL ID currently restores visible messages only from this browser's matching cache.

### Minimal retrieval selection — 2026-11-11

Approved intent: reuse the current embedding/retrieval/history services; select facts and cards by similarity without another durable index, duplicated authorization policy or ingestion pipeline. Rank only already-authorized, policy-projected records. Cache vectors using existing Space-scoped Redis helpers and content/model identity; changed approval/visibility is still enforced on every request. Preserve manual facts, source chunks, citations, cards/images, continuation tools and provider fallback.

- [x] `embedding/service.py:similarity_scores` reuses the existing configured/tracked batch adapter and Redis `get_many`/`set_many`. Keys include Space, model/dimensions/base URL and content hash; only vectors are cached. Unchanged records reuse vectors without a new durable index or lifecycle/backfill path. The existing hybrid search exposes its query vector on the same worker, avoiding a second embedding of the question; worker-local state is outside SDK objects so their copy behavior remains intact.
- [x] `knowledge/retrieval/retrieve_chunks.py:select_records` applies one cosine ranking and shared token/count budget to already-authorized facts and minimal card projections (type/title). Manual facts use the same path. Whole records exceeding the token budget are omitted rather than truncated; ranking outages retain bounded authorized records and record degraded status. `YULLO_CHAT_MAX_RECORD_TOKENS` defaults to 2048 and `YULLO_CHAT_EMBEDDING_CACHE_SECONDS` to 3600; both are validated in the existing config. Record count reuses `RAG_TOP_K`.
- [x] Passage retrieval now respects `RAG_TOP_K`, or the active reranker's final top-N, while preserving its larger candidate-fetch budget and post-search Space/document checks. Empty/unavailable/disabled/success are distinguished in `schemas/retrieval.py`. Prompt composition lets generation continue with available authorized evidence during search outages, with uncertainty for unsupported details. Query vectors are excluded from serialized results.
- [x] Existing `inference/streaming.py:prepare_response` owns one shared load/rank callback used by initial retrieval and optional `search_space_knowledge`. Yullo wires it through `api/public.py`; the existing Agent/session history lets the LLM supply a standalone follow-up query, replacing the heuristic on this path without a separate rewrite-model call or history implementation. Generic callers retain their previous defaults. The tool rechecks source eligibility and is limited to one search per reply.
- [x] `ui_render/response.py` uses one citation builder and one retrieval-tool lock, preserving the single-use continuation cap. Refreshed cards/images reuse existing validators and source-image URL handling; dynamic evidence lists and buffering preserve image conversion, continuation behavior and streaming. No ingestion/extraction/review/publication changes, new endpoints/tables, re-indexing, migration or live provider/data calls.
- [x] Ten changed Python modules parse for Python 3.11; focused Ruff E9/F and task-scoped whitespace checks pass. AST comparisons confirm existing embedding factories and hybrid ranking/filter logic are unchanged apart from request-local query-vector capture. Runtime tests remain skipped per the user's standing instruction; no tests added or edited.

Pending: live Redis/embedding and authenticated retrieval/tool/browser verification. Similarity selection bounds facts/cards separately from the existing chunk/continuation limits; it does not impose a new limit on native conversation history or the entire model prompt. Cold record caches incur batch embeddings; only selected eligible record projections enter generation. Search tools cannot guarantee an answer when the requested information or model provider is unavailable.

### Native session creation timestamp fix — 2026-11-12

Completed: `app/orchestra/ai/session/store.py:StagedHistory.open` sets `created_at` and `updated_at` to the current Unix timestamp only when creating a new Agno `AgentSession`. Agno's constructor defaults both fields to `None`, and the installed Postgres adapter inserts that explicit null, causing the reported `agno_sessions.created_at` NOT NULL violation. Resumed session timestamps, scope checks, history merge/publish and application message transactions remain unchanged. No endpoint, schema, migration or database-data changes.

Verification: Python 3.11 AST parsing, focused Ruff E9/F and task-added whitespace checks passed. Tests remain skipped per user instruction; live Postgres/new-chat verification remains pending.

### Passage content metadata and local links — 2026-11-12

Approved scope: supply each retrieved chunk with its available content metadata rather than structural fields alone. Reuse stored associations; the LLM decides linked text and existing component selection. No new source approval gate, catalog, link registry or rendering tool.

- [x] `knowledge/retrieval/retrieve_chunks.py:passage_context` includes nonempty content metadata alongside each passage, decodes stored JSON fields (including links/images/headings), retains zero/false values and structural/continuation context, and excludes internal routing/storage fields. Chunk-local item/price/link associations are retained, not inferred or rebuilt.
- [x] `api/public.py`, `inference/streaming.py`, `ui_render/response.py` and `prompts/yullo/composer.py` use the same formatter for initial context, follow-up search and continuation output/budget accounting. Existing asset disclosure policy is injected by Yullo; no fact/entity approval is required for chunk metadata. Existing supplementary source-link recovery, image/card tools, extraction/review, Space/source scope and provider behavior remain.
- [x] `prompts/yullo/base.py` directs the model to use the matching supplied item destinations and preserve item/price/variant relationships without treating category promotions as item prices or source evidence as live stock.
- [x] Verification: all six changed Python modules pass Python 3.11 AST parsing and focused Ruff E9/F checks. Task-added whitespace checks pass. User explicitly chose "Skip tests" after implementation; no runtime tests run or new tests written.

Pending: live model/browser verification; focused existing tests remain unverified and skipped by user request. More metadata increases initial context size; existing stored per-chunk asset limits and continuation token budgets remain. This change enables linked text from chunks; new product-card components and changes to structured-entity review are outside scope. No endpoint, schema, migration, re-indexing, database writes, commit or deployment.

### Answer-first citations and linked-list presentation — 2026-11-12

Reported: a fresh Amazon reply still omitted links after the metadata update; retrieved references appeared before streamed answer text. Read-only chat inspection confirmed the matching reply was generated after the changed files reloaded. The saved audit history still does not contain the exact model context, so model omission versus a particular retrieved set cannot be conclusively distinguished for that run.

- [x] `inference/streaming.py:generate_response` defers initial and search/continuation citation events until generation completes, following answer text and UI and preceding `message.done`. Successful replies retain citation persistence; generation failures do not emit deferred references. Existing model tools, text/image streaming and commit-before-done remain.
- [x] `ui/src/yullo/screens/public/components/AuraMessage.tsx` displays retrieved references only for completed replies, so earlier event arrivals cannot expose references during generation or before answer persistence.
- [x] `prompts/yullo/base.py` explicitly specifies linked item names for matching supplied destinations and fresh evidence for repeated questions; unsupported destinations remain unlinked, and category/promotional evidence is labeled honestly. LLM retains item/component selection; no automatic link matching or new cards.
- [x] Existing context-prepared logs now include passage/link/image/card counts and `common-v3` prompt version; no source contents or URLs are logged.
- [ ] Verification: static checks pending. Tests remain skipped under the user's explicit instruction; no new tests added.

Pending: live model/browser verification that the model uses matching links and citations appear only after completion. This strengthens model guidance rather than enforcing output links; no extra model calls, source mutations, schema changes, re-indexing or deployment.

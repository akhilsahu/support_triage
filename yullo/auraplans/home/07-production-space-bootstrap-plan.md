# Yullo Backend Demo Spaces Implementation Plan

> **For agentic workers:** Implement this plan after Home plans 01–06. Track work with the checkboxes in this document.

**Goal:** Create three realistic Yullo Spaces for one existing user through the real backend services so Home can be exercised with healthy, attention, and draft states without UI automation or dashboard fixtures.

**Architecture:** Add one no-argument backend module containing a typed `build_demo_config()` function and an idempotent orchestrator. The orchestrator resolves one owner, calls the same Space, source, ingestion, entity and publication services used by production, then reads the real Home service for verification. It never inserts Home projections, metrics, conversations, intelligence signals or events directly.

**Tech Stack:** Python, Pydantic v2, SQLAlchemy async, PostgreSQL, existing Yullo services, shared ingestion worker and blob store.

**Spec:** `yullo/auraplans/home/README.md`, plans 01–06, and `yullo/auraplans/2026-09-18-aura-backend-implementation.md`.

## Global constraints

- Run only after the migrations and service contracts from Home plans 01–06 are implemented and applied.
- The runner takes no command-line parameters. All values live in `build_demo_config()`.
- Use one existing `User`; do not invent authentication credentials or bypass Yullo authentication.
- Every Space must have both the shared `Space` row and its `YulloSpace` extension.
- Use application services for writes. Direct SQL is allowed only for read-only verification and owner resolution.
- Source readiness and failure must come from the real ingestion pipeline.
- Owner entities must go through `create_owner_entity()` and its payload validation.
- Events must be emitted by the domain operation that owns the state change.
- Do not create evaluation records or depend on the evaluation subsystem.
- Do not fabricate conversations, enquiries, intent events, Home metrics, intelligence candidates or timestamps.
- The process must be safe to rerun for the same owner and configuration version.
- A slug owned by another user is a hard conflict; never rename or overwrite it.
- Support247 records must remain untouched.

---

## Target backend state

```text
Resolved Yullo user
├── Northstar Studio
│   ├── lifecycle: live
│   ├── one ready knowledge source
│   ├── offerings, location, contact, person, portfolio and booking entities
│   └── source.updated, entity.published and space.published events
├── Offers.Run
│   ├── lifecycle: live
│   ├── one ready knowledge source
│   ├── one controlled source that genuinely fails ingestion
│   ├── offering and contact entities
│   └── source.updated, source.failed, entity.published and space.published events
└── Acme Corp
    ├── lifecycle: draft
    ├── basic identity only
    ├── no ready source
    └── never published
```

Home must derive all displayed state from these canonical records. Sections without real qualifying evidence remain absent and the UI later reflows normally.

## Specification-driven execution

The runner executes a general JSON specification provided as a file argument.

```bash
python -m app.yullo.bootstrap generated-spaces.json
```

Internal contracts:
```python
await bootstrap_from_payload(payload: dict)
await bootstrap_from_file(path: str)
```

The generated input must provide exactly one owner:
```json
{
  "owner": {
    "email": "owner@example.com"
  }
}
```

If the owner is missing or does not exist, exit non-zero before writes. Do not print every user email because that unnecessarily exposes account information.

## Fixed sample content

### Northstar Studio

- Slug: `northstar-studio`
- Purpose: `business`
- Description source title: `Northstar Studio profile`
- Knowledge: independent Bengaluru brand and product design studio; services include brand strategy, visual identity, product design and design systems; consultations are available by booking; contact `hello@northstar.example`; business hours Monday–Friday 09:30–18:00 Asia/Kolkata.
- Entities:
  - offering: Brand Strategy
  - offering: Product Design
  - location: Bengaluru, Karnataka, India
  - contact_channel: `hello@northstar.example`
  - action: booking with an HTTPS destination owned by the sample configuration
  - person: Mira Shah, Creative Director
  - portfolio_item: Atlas Finance identity system
  - portfolio_item: Loom collaborative workspace

### Offers.Run

- Slug: `offersrun`
- Purpose: `business`
- Healthy source title: `Offers.Run profile`
- Knowledge: an offer-discovery service that helps people find published, current offers by category; support contact `support@offersrun.example`; no payment or redemption claim is made.
- Entities:
  - offering: Offer discovery
  - contact_channel: `support@offersrun.example`
- Failure source: an AI-generated input selects a deterministic internal fixture for a malformed PDF.
  ```json
  {
    "type": "fixture",
    "fixtureKind": "malformed_pdf",
    "expectedOutcome": "failed"
  }
  ```
  It must pass source acceptance but fail during the real parse/index worker. This scenario is permitted only when `ENVIRONMENT` is development, test or staging.

### Acme Corp

- Slug: `acme-corp`
- Purpose: `business`
- Identity only; no sources or entities.
- Lifecycle remains `draft`, onboarding step remains `teach`, and publication is never called.

The `.example` domain prevents accidental delivery or external business claims. Payloads remain realistic but clearly non-production identities.

---

### Task 1: Add typed bootstrap contracts and payload parser

**Files:**
- Create: `app/yullo/bootstrap/__init__.py`
- Create: `app/yullo/bootstrap/runner.py`
- Test: `tests/unit/yullo/bootstrap/test_runner.py`

**Interfaces:**
- Produces: `BootstrapPayload`, `SpaceSpec`, `SourceSpec`, `EntitySpec`, `bootstrap_from_payload()`, and `bootstrap_from_file()`.
- Consumes: existing source/entity command contracts.

- [ ] Define strict Pydantic models with `extra="forbid"` for parsing the JSON specification.
- [ ] Parse the explicit `owner.email` from the payload and validate unique slugs, source keys, and entity keys.
- [ ] Exit non-zero before writes if the owner is missing or does not exist (do not print all user emails).
- [ ] Add a deterministic internal function `build_malformed_pdf_fixture() -> bytes` returning `b"%PDF-1.7\nmalformed-demo-payload\n%%EOF"`. 
- [ ] Process `"fixtureKind": "malformed_pdf"` by using this internal byte sequence (allowed only in dev/test/staging).

### Task 2: Create one canonical Yullo Space creation service

**Files:**
- Create: `app/yullo/services/spaces/creation.py`
- Modify: `app/api/v1/yullo_onboarding.py`
- Test: `tests/unit/yullo/spaces/test_creation.py`

**Interfaces:**
- Produces: `create_or_resolve_yullo_space(db, *, owner_user_id, spec, operation_key) -> CreatedYulloSpace`.
- Consumes: shared `Space`, `YulloSpace`, `YulloConfig`, and `KnowledgeBase` models.

- [ ] In one transaction, lock the owner and resolve by `(namespace/product='yullo', slug)`.
- [ ] If the owned Space already matches the stable operation key/config version, return it without creating duplicates.
- [ ] Reject a foreign owner, Support247 Space, or same key with conflicting immutable identity.
- [ ] For a new Space, create the shared `Space` with `owner_user_id`, its `YulloSpace`, `YulloConfig`, and primary `KnowledgeBase` atomically.
- [ ] Update onboarding creation to call this service so bootstrap and UI cannot produce different Space shapes.
- [ ] Do not use temporary fake email/password values as Space identity.

### Task 3: Complete ingestion-owned lifecycle events

**Files:**
- Modify: `app/orchestra/ai/ingestion/orchestration.py`
- Modify only if required for parity: `app/yullo/services/sources/service.py`
- Test: `tests/unit/yullo/sources/test_ingestion_events.py`

**Interfaces:**
- Produces: committed `source.updated` or `source.failed` events from real finalization.
- Consumes: accepted `KnowledgeBaseItem`, `IngestionJob`, worker lease token and `append_domain_event()`.

- [ ] On successful finalization, update item/job state and append `source.updated` in the same successful transaction using item/version/job metadata and a stable dedupe key.
- [ ] On failed finalization, update item/job failure state and append `source.failed` in the same transaction with a bounded stable error code, not raw exception text.
- [ ] Preserve worker lease validation; a stale worker cannot write state or an event.
- [ ] Confirm retries return the existing event instead of duplicating Recent activity.

### Task 4: Implement idempotent per-Space orchestration

**Files:**
- Modify: `app/yullo/bootstrap/home_demo.py`
- Modify: `app/yullo/services/entities/service.py`
- Test: `tests/unit/yullo/bootstrap/test_home_demo_orchestrator.py`

**Interfaces:**
- Produces: `bootstrap_space(db, owner, spec, config) -> SpaceBootstrapResult`.
- Consumes: canonical Space creation, `SourceService.accept_source()`, blob storage, `create_owner_entity()` and `publish_space()`.

- [ ] Resolve or create each Space using the canonical service.
- [ ] Derive UUIDv5 source idempotency keys from config version, owner ID, slug and source key.
- [ ] Submit healthy text through `TextSourceInput`; never insert a knowledge item or job directly.
- [ ] For the Offers.Run failure scenario, store the configured malformed bytes through the real blob adapter and submit the returned key through `FileSourceInput`.
- [ ] Poll persisted jobs until terminal state or timeout. The runner may dispatch through the existing job dispatcher but may not call finalization with invented results.
- [ ] Require Northstar's healthy job to finish successfully. Require Offers.Run to have one successful healthy source and the controlled job to finish failed. Any different result aborts publication and reports the actual states.
- [ ] Extend `create_owner_entity()` with an optional caller-supplied `entity_id`. Derive stable UUIDv5 IDs from config version, owner ID, Space slug and entity key. An existing same-Space row with identical type/payload is returned; a reused ID with different type/payload raises a conflict.
- [ ] Create missing entities only through `create_owner_entity()` using those deterministic IDs; never store bootstrap bookkeeping inside the public entity payload.
- [ ] Do not create evidence rows for owner-origin entities.

### Task 5: Replace simulated publication readiness

**Files:**
- Modify: `app/yullo/services/spaces/publication.py`
- Modify: `app/yullo/bootstrap/home_demo.py`
- Test: `tests/unit/yullo/spaces/test_publication.py`

**Interfaces:**
- Produces: deterministic `validate_publication_readiness()` and idempotent `publish_space()`.
- Consumes: owned Yullo Space, valid handle, ready published knowledge item, configuration and current context version.

- [ ] Remove `_call_aura_publication_service()` returning unconditional `True`.
- [ ] Validate the Space belongs to the owner and Yullo namespace, its extension/config exist, its handle is valid, and at least one current knowledge item is genuinely ready.
- [ ] Publish Northstar and Offers.Run only after readiness passes; emit `space.published` once with the real version.
- [ ] Never call publication for Acme Corp.
- [ ] A rerun of the same published version is a no-op.

### Task 6: Add the CLI entrypoint and backend report

**Files:**
- Modify: `app/yullo/bootstrap/runner.py`
- Create: `app/yullo/bootstrap/__main__.py`

**Interfaces:**
- Produces: `async bootstrap_from_payload() -> BootstrapReport` and `main() -> None`.
- Consumes: JSON file path from sys.argv, `AsyncSessionLocal`, Space orchestrations and the real Home service.

- [ ] Resolve the owner using the explicitly provided email in the payload before any write.
- [ ] Process Spaces sequentially so logs and failures clearly identify the affected Space.
- [ ] Commit each accepted domain operation at its existing service boundary; do not hold one transaction open while waiting for ingestion.
- [ ] After all three scenarios finish, call `get_yullo_home()` for the resolved owner.
- [ ] Print identifiers and state only: owner ID/email, Space IDs/slugs/lifecycle, source job IDs/statuses, entity counts, emitted event counts and Home-derived status. Never print source bodies, session cookies or credentials.
- [ ] Exit non-zero when preflight, ingestion expectation, publication or Home verification fails.

### Task 7: Verify the real data path and rerun safety

**Files:**
- Test: `tests/integration/yullo/test_home_demo_bootstrap.py`
- Update: `docs/YULLO_AURA_OPERATIONS.md`

**Interfaces:**
- Consumes: configured development database, blob store, ingestion worker and Home service.
- Produces: a repeatable operator procedure and an integration result.

- [ ] Run once and verify exactly three owned Yullo Spaces with the required extension/config/KB records.
- [ ] Verify Northstar has a ready published source and all configured public owner-confirmed entities.
- [ ] Verify Offers.Run has a ready source, one real failed current attempt and a derived attention item.
- [ ] Verify Acme remains draft with zero ready sources and a setup suggestion derived by Home.
- [ ] Verify Recent uses real `source.updated`, `source.failed`, `entity.published` and `space.published` events.
- [ ] Verify the Home response excludes Support247 and other users' Spaces.
- [ ] Run the bootstrap a second time and verify Space, source, entity and event counts do not increase.
- [ ] Document the new `python -m app.yullo.bootstrap generated-spaces.json` command and the required `owner` block in the JSON.

## Completion criteria

- One command with a JSON file argument creates or resolves the specified scenarios for an explicit existing user.
- All domain records pass through production backend services and constraints.
- Real worker outcomes drive source readiness and attention.
- The Home backend returns healthy, attention and draft Space states without fixtures.
- Unsupported Home intelligence remains absent rather than fabricated.
- A second run is a safe no-op except for resuming legitimate incomplete jobs.
- No Yullo evaluation dependency, UI automation, direct Home insertion or Support247 mutation is introduced.

## Execution gate

This document authorizes planning only. Before implementation, review the current Alembic head and confirm plans 01–06 are complete. Before running against a database, review the selected owner printed by preflight and the three resolved slugs. Running the bootstrap creates durable database, blob and vector-index data for that owner.

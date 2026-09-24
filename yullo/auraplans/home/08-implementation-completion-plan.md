# Yullo Home and Bootstrap Completion Implementation Plan

**Date:** 2026-09-20
**Status:** Ready for implementation review; no application code or database changes executed by this document.
**Goal:** Complete the existing real-data bootstrap and Home integration with typed Space entities, durable ingestion, grounded Home responses and persisted section preferences.
**Architecture:** Reuse shared Spaces, knowledge groups/items, ingestion jobs and conversation records. Keep Yullo policy, entity schemas, orchestration and UI under the existing Yullo packages. All input paths call the same authenticated service functions.
**Stack:** Existing FastAPI, SQLAlchemy/PostgreSQL, Pydantic, ingestion runner, React and TanStack Query.
**Specifications:** `../2026-09-18-aura-backend-implementation.md`, plans 01–07 in this directory. This document corrects the implementation gaps reviewed on 2026-09-20; it does not replace the established product design.

## Information: what entities mean

An entity is a structured object describing something a Space offers, contains or lets a visitor do. It is not another document, chatbot, agent or knowledge group. One Space can have many entities of several types. General factual statements remain in `kb_facts`; documents, PDFs, URLs and text stay in `knowledge_base_items`, grouped by `knowledge_bases`.

Use the exact canonical identifiers from the Aura plan:

| Identifier | Use | Example | Version 1 payload contract |
|---|---|---|---|
| `offering` | Describe a service or product offered by the Space | Brand identity service | Required `name`; optional `description`, `price_amount` as nonnegative decimal string, `currency` as three uppercase letters, `duration_minutes` positive integer. Amount and currency must appear together. |
| `location` | Display an actual office, venue or service location | Northstar Bengaluru office | Required `name`, `address`; optional `latitude`, `longitude`, `map_url`. Coordinates appear together and are range checked. |
| `portfolio_item` | Show a completed work example | Acme brand redesign | Required `title`; optional `description`, `media_urls`, `project_url`. Never invent client names or outcome metrics. |
| `contact_channel` | Offer an explicit contact method | enquiries@example.com | Required `label`, `channel`, `value`; channel is `email`, `phone`, or `website`, with corresponding email/E.164/HTTPS validation. |
| `person` | Describe a public team member | Maya, Design Lead | Required `name`; optional `role`, `bio`, `image_url`. Only explicitly public owner-approved details. |
| `event` | Describe an event hosted/listed by this Space | Brand workshop | Required `title`, timezone-aware `starts_at`; optional `ends_at`, `location_entity_id`, `registration_url`. End must follow start; referenced location belongs to this Space. |
| `action` | Present a configured visitor action | Book a consultation | Required `label`, `kind`, `destination_url`; kind is `booking`, `enquiry`, or `external_link`. Destination is validated HTTPS. Rendering an action never executes a booking or submits data automatically. |

Optional fields are omitted when unknown. No invented price, opening hours, coordinates, links or availability. Use `portfolio_item` and `contact_channel` in storage/API; “portfolio” and “contact” are presentation labels only.

`brand_voice`, `brand_identity`, and `product_guidelines` are not replacements for these entities. Tone belongs in reviewed Aura configuration where a supported setting exists; logos/colours belong in appearance configuration; lengthy brand guidelines belong in knowledge documents. Preserve existing rows until individually classified. Never automatically relabel one of these rows as an offering or delete it.

## How information enters the tables

### Owner input or explicitly approved bootstrap input

```text
Owner form / approved JSON
  -> validate_entity_payload(type, version, payload)
  -> create_owner_entity(db, user_id, space_id, command)
  -> verify owner + Yullo Space
  -> yullo_space_entities
  -> append_domain_event in the same transaction
  -> commit
  -> eligible public Aura response and Home capability reads
```

The owner input is the authority: `origin_type='owner'`, `review_status='owner_confirmed'`. It does not require fabricated document evidence. Public visibility must be explicit, not inferred merely because a model supplied JSON.

AI-generated demo content is synthetic input for a designated nonproduction owner. An AI preparing JSON does not confer factual authority for an actual business. Production imports require approved owner-provided content; extracted assertions use the candidate path below.

### Document-derived candidate

```text
Text / PDF / URL
  -> SourceService.accept_source
  -> shared knowledge_base_items + ingestion_jobs + durable blob
  -> real parser/indexer
  -> committed successful current source version
  -> extract_entity_candidates(provider, source_item_id, source_version)
  -> strict payload and source-locator validation
  -> persist_entity_candidates
  -> entities: extracted, private
  -> evidence: source item + KB + source version + locator
  -> owner reviews/edits/confirms
  -> eligibility rechecked, entity becomes publicly usable
```

The model proposes candidates only. Missing information stays missing. Evidence must refer to actual text spans/pages/chunks from that source, not model-invented references. Source text cannot override application instructions. Extraction failure must not undo successful document ingestion.

`yullo_space_entity_evidence` stores references, not PDF bytes or another copy of a document. Use the actual columns: `entity_id`, `space_id`, `source_item_id`, `source_kb_id`, `source_version`, `locator_metadata`.

### Consumption

Aura retrieves eligible entities within the current Space and returns allowlisted UI nodes referring to entity IDs. The server resolves and validates those IDs; the frontend renders supported components. Unknown node types are omitted safely. Home reads capabilities and real events; it never asks an LLM to invent activity. No cross-Space Aura delegation is introduced.

## Global constraints

- Config-driven, pluggable and isolated. Registries define supported types, providers, section IDs and action kinds; owner config cannot enable arbitrary code or weaken authorization.
- Reuse existing shared tables. Add columns/constraints only for demonstrated missing identity or lifecycle requirements.
- Preserve existing Home sections, layout and authentication boundaries.
- Nearby/connection modules remain empty when no real provider exists. Do not fill them with samples in production.
- Recheck applied Alembic revisions before migration edits. Never rewrite an applied migration; use a follow-up revision.
- Deferring Yullo evaluation does not authorize dropping shared Support247 evaluation data.

## Task 1 — Canonical entity contracts and safe creation

**Files:** create `app/yullo/services/entities/payloads.py`; modify `contracts.py`, `service.py`, `extraction.py` in that directory and `app/yullo/bootstrap/runner.py`.

**Interfaces:**
```python
EntityType = Literal['offering', 'location', 'portfolio_item',
                     'contact_channel', 'person', 'event', 'action']
def validate_entity_payload(entity_type: EntityType, schema_version: int,
                            payload: dict) -> dict: ...
# Returns canonical JSON after the selected Pydantic schema validates it.
```

- [ ] Implement seven Pydantic payload models using the table above; `extra='forbid'`. Registry key is `(entity_type, 1)`; reject unknown versions/types. Apply bounds: names/labels 1–200 characters, descriptions/bios at most 4,000, at most 10 media URLs. Reject active HTML, credential-bearing URLs and unsupported schemes. Reuse existing URL safety validation for any server-side fetch.
- [ ] Make `EntityCommand` and bootstrap `EntitySpec` invoke this same validator. Normalize decimals to strings and times to UTC ISO values. Use typed UUIDs for references and check referenced entity ownership/type in the service.
- [ ] Add explicit `is_public` to owner commands with default false; bootstrap fixtures explicitly opt in. Retain owner checks before persistence. Validate patches as the full merged payload, increment revision and emit events transactionally only on meaningful transitions.
- [ ] Standardize eligibility to `owner_confirmed` or `source_authoritative`, active, public, within the Space's publication rules. Replace the current generic `trusted` branch; migrate only records whose authority can be demonstrated. Unknown legacy rows remain unavailable publicly without losing original content.
- [ ] Add stable `identity_key` and unique `(space_id, entity_type, identity_key)` if absent, as required by the Aura plan. Backfill existing rows with their ID string; use stable bootstrap entity keys for new imports. Same key/same payload returns existing row; changed payload raises 409 unless an explicit revision update is requested.
- [ ] Add positive revision/schema-version constraints. Inventory existing values before adding type/status constraints; do not let unclassified historical rows make a deployment fail unexpectedly.

**Acceptance:** all seven example objects validate through both bootstrap and normal service; cross-Space references and invalid payloads fail before writes.

## Task 2 — Source extraction and evidence correctness

**Files:** modify `entities/extraction.py`, `entities/service.py`; create `entities/providers.py`; reuse the existing configured model/provider infrastructure.

**Interfaces:**
```python
class EntityExtractionProvider(Protocol):
    async def extract(self, *, source_text: str,
                      allowed_types: list[str]) -> list[dict]: ...
async def extract_entity_candidates(*, source_item_id: UUID,
                                   source_version: int,
                                   provider: EntityExtractionProvider
                                   ) -> list[ValidatedEntityCandidate]: ...
```

- [ ] Resolve current successfully ingested source content and locators on the server. Configure provider/model, source-size limit, timeout and retry count; default extraction disabled until the provider and evidence validation are wired.
- [ ] Validate every returned candidate through Task 1 and resolve each evidence locator against actual source content. Reject unsupported claims/locators. Do not mark model output authoritative based on confidence.
- [ ] In a short transaction, lock/recheck item version, Space and KB; write candidate plus evidence atomically. Replace nonexistent constructor fields `source_authoritative`, `space_entity_id`, `kb_item_id`, `item_version`, `locator_json` with actual model columns. Store `source_kb_id` from the locked item, never client input.
- [ ] Use stable source/version/candidate identity to make retries idempotent. Owner confirmation rechecks current evidence; source replacement removes stale candidates from eligibility and requests review rather than silently refreshing facts.
- [ ] Invoke extraction after successful ingestion commit through a recoverable job path; persist failure in that job's lifecycle. Do not block basic ingestion when extraction is disabled/unavailable.

**Acceptance:** one source can produce a private offering candidate with verifiable evidence; it remains unavailable to public Aura until confirmed.

## Task 3 — Reliable shared ingestion

**Files:** `app/orchestra/ai/ingestion/orchestration.py`, existing job runner/registry, `app/yullo/services/sources/service.py`, `app/yullo/adapters/home_events.py`.

- [ ] Authorize ownership/product before blob writes. Resolve the configured active primary KB in the same Space; reject a foreign configured KB ID.
- [ ] Change `item.synced_at` to `item.last_synced_at`; persist stable allowlisted error codes rather than raw exception text. Keep detailed errors in server logs.
- [ ] Replace direct event insert/whole-transaction rollback with `append_domain_event` conflict-safe insertion. Job state, item state and event commit together. A non-deduplication integrity failure propagates.
- [ ] Claim jobs atomically only when queued or when an existing lease has expired. Set lease expiry to now plus configured duration, heartbeat long jobs, and compare lease token and source version during finalization. A stale worker cannot publish its index pointer.
- [ ] Register the item worker with the existing runner. Dispatch committed jobs and support recovery scans; verify at-least-once deliveries do not process a currently leased job twice. Bootstrap may invoke this same worker directly, but must not be the only working dispatch path.

**Acceptance:** duplicate delivery, worker crash and source replacement preserve correct canonical state; completed items have persisted freshness timestamps.

## Task 4 — Space creation, publication and bootstrap

**Files:** `app/yullo/services/spaces/creation.py`, `publication.py`, `app/api/v1/yullo_onboarding.py`, `app/yullo/bootstrap/{runner.py,__main__.py}`, `generated-spaces.json`.

- [ ] Scope slug lookup by Yullo product; reuse slug normalization/reserved-name checks. Resolve existing KB through configuration. Reject changed identity/purpose on rerun rather than silently ignoring it.
- [ ] Remove dummy Space credentials after auditing legacy nullability/auth consumers. If needed, add a Yullo-only compatibility migration allowing absent legacy credentials while preserving Support247's credential requirements and login behavior.
- [ ] Route onboarding launch and bootstrap publication through the same owner-checked service. Lock the Yullo extension version; verify configured KB, current ready sources and entity eligibility. Publish that exact context version and emit one idempotent event.
- [ ] Prevalidate the entire bootstrap payload: unique Space slugs, source/entity keys, supported versions, required data and explicit owner. If both email and phone are supplied, require them to resolve to the same user. Add an explicit display name instead of deriving business identity from a slug.
- [ ] Provide `validate_bootstrap_payload(payload)` and `preflight_bootstrap(config)`; preflight checks applied schema, owner, slug conflicts, blob provider and worker availability without durable writes. Expose a dry-run CLI option while keeping the input JSON self-contained.
- [ ] Permit malformed fixtures only in explicit development/test/staging environments. Add bounded per-job execution time, record partial results on failure, and keep deterministic keys stable across retries. Never auto-delete partially created business data.
- [ ] After execution call `get_yullo_home(db, user, now)`. Report Space IDs, real slugs, source/item/job IDs, lifecycle, entity counts and Home attention. Fail verification when configured expectations differ. Do not require synthetic conversations or Orbit items to appear.

**Acceptance:** rerunning the three-Space payload creates no duplicates; real data produces a published healthy Space, a source-failure scenario and a draft Space.

## Task 5 — Real Home data, evidence and preferences

**Files:** `app/yullo/services/home/{repository.py,service.py,preferences.py}`, `app/schemas/yullo_home.py`, `ui/src/yullo/{api/queries.ts,home/apiAdapter.ts,screens/YulloHome.tsx}`.

- [ ] Extend `SpaceRecord` with stored slug and canonical Yullo lifecycle. Load actual description/logo where supported; leave unknown optional fields absent. Calculate last activity from canonical events/turns; do not substitute creation time as activity.
- [ ] Use existing metric definitions from plan 02 for new conversations and Right Now. Return computed counts explicitly; distinguish unavailable metrics from real zero.
- [ ] Return stored theme and normalized effective section preferences. UI derives visibility from that response and reflows existing modules; preference PATCH updates the same owner-scoped query cache. Clear private cache on logout/account change.
- [ ] Carry evidence and action kind/target IDs through the full response contract. Remove browser-generated observation times and invented source labels. Invalid evidence suppresses an intelligence item; unsupported actions are not rendered as clickable `#` links.
- [ ] Type the adapter against the actual response, replacing `any`. Map For You and Quick Insight only from supported grounded server signals; preserve their existing sections when eligible data exists. Do not add fictitious providers to fill empty modules.
- [ ] Verify each action resolves to an existing authorized destination. An absent source-management/pattern route is an explicit integration gap and must remain non-clickable until implemented.

**Acceptance:** Home uses real slugs, persists section toggles across reloads, and every displayed intelligence timestamp is traceable to backend evidence.

## Task 6 — Migration and release reconciliation

- [ ] Inspect current database revision and migration history; latest code head observed in review was `b61d331fc6f3`. Do not assume that it is applied.
- [ ] Review shared evaluation-table deletion separately. Disable Yullo evaluation dependency without dropping Support247 data. If a destructive migration has run, use actual backup/history to plan recovery; recreating empty tables is not data restoration.
- [ ] Audit model/migration parity and unrelated enum changes. Add focused forward migrations where needed; preserve existing source/entity data and composite ownership constraints.
- [ ] Reconcile plan 07's old `home_demo.py` references with `runner.py`, update payload samples and mark verified completion only. Update this directory's README to link this completion plan.

## Focused verification and completion gate

Avoid broad unrelated test expansion. Add behavior checks for seven entity contracts, cross-owner/source evidence rejection, ingestion duplicate finalization, and bootstrap rerun. Update the outdated bootstrap test that currently includes removed timeout fields and an unsupported entity type.

Run focused bootstrap tests using the project interpreter. Run the existing integration test only against a designated isolated test database/blob/index namespace; its current version imports the configured application session and creates durable records. Add cleanup and environment checks first.

Complete one real three-Space run, then authenticated Home GET, preference PATCH/reload, public Aura lookup and a foreign-owner denial. Verify disabled sections reflow and missing intelligence remains absent. Record commands, result counts and database revision without secrets or source bodies.

Completion means this full path works: approved input -> shared creation/ingestion -> validated entity/evidence -> publication -> authenticated Home -> existing UI. A successful schema-only unit test is not sufficient evidence.

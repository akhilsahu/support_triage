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

## Nested Spaces — 2026-11-12

User requested analysis and implementation of graph drill-down with typed subspaces. Selected design: each child is a canonical Space, with one optional parent and a Space type (`space`, `event`, `project`, `location`, `community`). This classification does not replace entity types or canonical event/location records. Hierarchy is owner-only navigation; each child retains its own sources, knowledge, Aura, appearance, permissions and publication. Parent membership is not published or added to model context.

Alternatives considered: entity-only nodes cannot provide a full independent app; a multiple-parent graph adds ambiguous navigation and lifecycle semantics. Start with a single-parent tree, arbitrary nesting with cycle rejection, same-owner Yullo links only, independent globally unique handles, and explicit detach before parent archive/delete. No inherited knowledge or automatic creation from extracted entities.

- [x] Add Yullo-only parent/type/revision columns and forward migration after verified code/applied head `b9c0d1e2f3a4`. Existing Spaces default to roots of type `space`. No shared Support247 columns change.
- [x] Add owner-scoped hierarchy read/update services and routes; serialize hierarchy writes on the owner row, reject cycles/foreign/archived parents and stale revisions. Extend canonical Space creation for new children; guard archive/delete. Do not use or reset onboarding drafts.
- [x] Add dashboard breadcrumb, typed children table, inline create/link/detach controls; Home graph root/child navigation with URL state and child counts. Keep existing Home metrics and features intact.
- [x] Run static compilation/build/diff checks; inspect migration DDL and final file changes. Unit/integration tests require user approval; do not seed user data. Record applied versus unapplied migration and remaining integration gaps.

Files: `app/models/yullo_space.py`, `app/yullo/{schemas/spaces.py,services/spaces/{hierarchy,creation,handles}.py,services/persistence/identity.py,schemas/forms/identity.py,api/space_forms.py}`, `app/api/v1/yullo_onboarding.py`, `alembic/versions/c0d1e2f3a4b5_yullo_subspaces.py`; `ui/src/yullo/{api/spaces.ts,api/forms.ts,forms/subspaces/Subspaces.tsx,components/home/SpaceNetwork.tsx,components/YulloPulse.tsx,home/sectionRegistry.tsx,screens/{SpaceDashboard,YulloHome}.tsx}`. Endpoints: authenticated no-store `GET /api/v1/yullo/spaces/hierarchy`, revision-checked `PATCH /api/v1/yullo/spaces/{space_id}/hierarchy`, extended `POST /api/v1/yullo/spaces`.

Lifecycle safeguards: both ends of a hierarchy link become managed by explicit Space ID (`current_step`/`onboarding_step='managed'`), retained after detaching. Global onboarding draft selection excludes these Spaces; draft mutations share the owner lock, reset refuses parents with children, and handle reservation cannot reclaim managed Space handles. A stable client-generated child handle permits retrying creation after a lost response without overwriting an existing child. Hierarchy has an independent revision and does not change publication context, sources, extraction, review or Aura retrieval. Archived children remain visible to the owner in the parent table so they can be detached; graph nodes use the existing eligible Home list. Graph has an accessible full list and uses the existing section registry; reduced motion and keyboard focus are supported.

Verification: TypeScript check, production UI build, Python parsing, router imports, ORM mapper configuration, generated PostgreSQL migration DDL, focused UI anti-slop/motion scans and `git diff --check` passed. Applied **only** the additive migration to the verified loopback development database; confirmed revision `c0d1e2f3a4b5` and all three columns. No user records were read or seeded for verification, and no production changes were made. Existing build warnings concern dependency annotations, Browserslist data and mixed imports.

Pending approval: behavior tests and authenticated/browser integration. Exercise nested creation/retry, root linking/detach, type edits, stale writes, cycle and foreign-owner rejection, parent removal guards, private publication, and onboarding reset/handle isolation in an isolated test namespace. No tests were written or run. Public parent/child discovery, multiple parents, linked entity-to-Space conversion and inherited context are outside this first version. Recommendation: use a subspace when an event/project needs its own knowledge, audience and publishing; retain lightweight details as existing entities.

### Approved simplification — 2026-11-13

User approved the discussed quick flow and retaining the revision guard. This supersedes the table/breadcrumb UI above. Keep the existing single-parent column; no relation table or version-history subsystem.

- [x] Node click immediately reveals its children. Replace branch breadcrumbs and Explore/Manage steps with Back, Open and an icon-only +. Retain the accessible full node list, existing Home details/metrics and section registry.
- [x] One shared `AddSubspace` component serves graph and dashboard. + offers Event, Service, Job, Project, Other. A compact Radix dialog contains name, optional short description and only relevant optional date/place/application/booking fields. No onboarding wizard, reset, temporary draft or autosave requests. Save commits a normal independent Space; its existing unpublished lifecycle remains separate from persistence.
- [x] Replace the dashboard table with simple child rows; keep link-existing in the + menu and classification/detach in secondary row options. Retain legacy Space/Location/Community classifications for existing records. Remove the unused ancestor helper and full dashboard breadcrumbs.
- [x] Add Bot / Building2 / Undo icon actions with labels/tooltips. AI suggests a description from submitted details only through the existing configured provider fallback utility. Company fill explicitly previews the owner's company description; acceptance records source revision and allows undo. No automatic parent knowledge retrieval, inheritance, publication or overwrite of input.
- [x] Add strict `QuickSpaceContext` input validation and persist quick details through canonical `SourceService.accept_source` as a child-local text source, in the creation transaction. Metadata records copied-company provenance; identifiers are kept out of source text. Extracted facts/entities still follow the existing ingestion/review pipeline; quick fields do not create duplicate event/job truth tables. Enqueue ingestion only after commit; dispatch failure leaves a durable job and logs safe IDs. Creation retries compare the existing canonical source request hash and reject differing details rather than silently losing edits.
- [x] Extend `SpaceType`/database constraint with service, job and other using forward migration `d1e2f3a4b5c6`; previous migration untouched. Verified applied revision c0d1e2f3a4b5 before applying only to the verified loopback development database. Confirmed applied revision d1e2f3a4b5c6; no user fixtures, production changes or commits.

Changed boundaries this pass: `app/yullo/schemas/{spaces.py,forms/identity.py}`, `services/{spaces/quick_context.py,persistence/identity.py}`, `api/space_forms.py`, `app/models/yullo_space.py`, `alembic/versions/d1e2f3a4b5c6_subspace_quick_types.py`; frontend `api/{spaces,forms}.ts`, `forms/subspaces/Subspaces.tsx`, `components/home/SpaceNetwork.tsx`, `screens/SpaceDashboard.tsx`. New owner/CSRF-protected, no-store endpoint: `POST /api/v1/yullo/spaces/{space_id}/subspace-description`.

Verification: TypeScript and production UI build passed; Python parsing, route imports, ORM mapper configuration, focused UI anti-slop/motion scans and diff checks passed. No new tests written or behavior tests run, following the required approval gate. Pending: approve and exercise isolated integration/browser checks for graph expand/back, keyboard dialog/menu behavior, all quick types, transactional source persistence, retry/content conflict, worker extraction/review, company preview/undo/revision conflict and AI provider success/failure. Application semantics (including booking/application links) remain contextual source data until the normal entity/review flow permits structured public actions. AI output is an owner-reviewed suggestion, not automatically verified factual content.

### Quick form visual refinement — 2026-11-13

User requested a more serious, compact form and questioned date/time in the primary flow. Updated only `ui/src/yullo/forms/subspaces/Subspaces.tsx`: restrained modal header/footer, smaller desktop field padding/type, clearer labels (Event title, Event overview, Scheduled start, Venue or meeting link; Role title/Work location/Application URL; Service name/Booking URL), neutral compact assistance icons and Create event/Cancel actions. Parent name is a quiet subtitle; publication status appears once in the footer. Event schedule/location are retained under a collapsed optional disclosure so the primary form contains title and overview. Existing entered schedule values remain intact when collapsed. Mobile controls retain touch targets and readable input text; theme accent focus styles remain dynamic. AI/company preview, acceptance/undo and persistent Save path are preserved. No schema, API, ingestion or publication changes.

Verification: TypeScript, production build, focused UI static scans and final diff checks passed. No new tests or browser behavior checks were performed; these await approval.

### Header + menu and date/time library — 2026-11-13

User requested a library date/time picker and removal of the visible Subspaces dashboard section. The dashboard now has a top-right icon-only + with a real hover/focus tooltip. Clicking opens four icon choices: Event, Posting, Service, Other. Job/Project and existing link/manage actions remain under More options. Linked child rows, classification, detach and parent navigation remain available in a secondary Linked Spaces dialog, preserving capabilities while removing the main-page heading/empty-state block. Existing #subspaces references target the header action. Graph uses the same shared + menu; its redundant empty hint was removed.

Added `forms/core/DateTimeField.tsx`, using `react-aria-components` 1.22.1 and `@internationalized/date` 3.12.4. Theme-aware calendar, localized segmented date/time entry, 24-hour time, validation, clear schedule and keyboard controls replace the native datetime-local input. Calendar portal stays inside the enclosing Radix dialog's focus scope. Existing local-time-to-UTC saving remains intact. Added both dependencies explicitly; npm updated the shared React Aria/date/stately dependency family in ui/package-lock.json. No separate calendar framework or custom calendar arithmetic.

Added Posting to the existing validated Space classification in API/model/frontend, preserving all previous types. Forward migration e2f3a4b5c6d7 extends only the classification constraint, after verifying code/applied head d1e2f3a4b5c6. Applied only to verified loopback development and confirmed e2f3a4b5c6d7. No records were seeded, production data changed, or applied migrations rewritten.

Files: ui/package{,-lock}.json; ui/src/yullo/forms/{core/DateTimeField.tsx,subspaces/Subspaces.tsx}, screens/SpaceDashboard.tsx, components/home/SpaceNetwork.tsx, api/spaces.ts; app/yullo/schemas/spaces.py, app/models/yullo_space.py; alembic/versions/e2f3a4b5c6d7_posting_space_type.py. Creation, source ingestion/review, Aura isolation and publishing contracts preserved. TypeScript and backend parse/import/ORM checks passed; final build/scans recorded below. No new tests written or behavior tests run. Pending approval: calendar/segmented time inside Radix focus trap, touch layout, tooltip/popover dismissal, all four creation choices, management actions and timezone round-trip in isolated browser/integration checks.

Completion verification: production UI build, TypeScript, backend imports/ORM configuration, focused UI scans and git diff checks passed. Root package files were unchanged; generated build output stays in ui/dist. Browser/behavior tests remain unrun pending approval.

### Full-page event form and location formats — 2026-11-13

User reported calendar clipping and requested a larger full-page event form, optional Online link, and Physical location through Google Maps.

- [x] Event creation now uses a full-screen Radix dialog with a scrollable, bounded-width form body and fixed header/footer. Other quick forms keep their compact dialogs. Schedule/location are directly visible; no nested disclosure is needed on the larger event page.
- [x] Replaced the date picker's nested popup with a library DateField and inline Calendar, retaining typed date/time entry, month navigation, selection, clear action, local-time-to-UTC conversion and keyboard controls. Calendar selection preserves an already-entered time. Inline normal flow removes the popup/scroll-container clipping mechanism entirely.
- [x] Added optional Online/Physical mode selection and Clear. Online accepts a meeting URL or blank. Physical reuses existing LocationSearchField and GoogleLocationPicker, with address suggestions, map pin selection and a Google Maps link. Address edits clear stale coordinates; only the active location mode is submitted. A location may remain unspecified. Existing map configuration/failure fallback is preserved; no new Maps loader, key or provider integration.
- [x] Extended QuickSpaceContext server/frontend contracts with location_mode, meeting_url, latitude/longitude and map_url. Validate mode, coordinate ranges/pairs, and conflicting online/physical fields. Legacy place-only requests remain compatible. The existing child-local source now records the explicitly entered event format, link/address and selected coordinates/map link, keeping ingestion, fact/entity review and hard-save creation intact. No database migration, new location table or direct entity insert.

Changed: ui/src/yullo/forms/{subspaces/Subspaces.tsx,core/DateTimeField.tsx}, ui/src/yullo/api/spaces.ts; app/yullo/schemas/spaces.py and services/spaces/quick_context.py. Existing shared LocationSearchField/GoogleLocationPicker files were not modified. Verification: TypeScript and backend parsing/import/ORM checks passed; final build/scans recorded below. No tests written or behavior tests run. Pending approval: full-page scrolling/focus, inline calendar/time/clear behavior, Online blank/link, Physical search/pin/manual fallback, mode changes clearing submitted stale data, saved source context and UTC handling in isolated UI/integration checks. Real Google Maps availability depends on the existing configured browser API key.

Completion verification: production UI build, focused UI static scans and final diff checks passed. Browser/Google Maps behavior and durable-save integration remain unverified pending test approval. No dependencies, migrations or production data changed in this refinement.

### Quick-add icon colors — 2026-11-13

User requested distinct colors for the Event/Posting/Service icons. Added four scoped category color tokens in ui/src/yullo/styles/tokens.css and subtle tinted icon containers in forms/subspaces/Subspaces.tsx: Event blue, Posting violet, Service teal, Other amber. Dark/dark-warm use lighter counterparts. Labels, focus and hover continue using dashboard/accent tokens; creation actions and APIs are unchanged. TypeScript and diff checks passed. Measured minimum icon-to-tinted-container contrast across all five theme surfaces: 4.07:1 (UI threshold 3:1). No unit or browser tests run; prior request for UI verification approval remains pending.

### Event form reference alignment and separate pickers — 2026-11-13

User supplied the current UI and a compact professional form reference, requesting a clearer layout, closed-by-default calendar, separate time picker and theme/accent adaptability. This supersedes the always-inline calendar design above.

- [x] Retain full-page event creation, with a narrower aligned 680px content column, canvas backdrop, distinct surface-backed inputs, stronger placeholder/helper text and grouped Schedule/Location sections. Actions sit beneath the fields rather than in a full-width bottom bar. Header, errors and footer align with the form. Other quick dialogs retain their compact format. Existing AI/company suggestions, preview/undo, online link, Google Maps location and persistence paths remain available.
- [x] Split schedule into Date and Start time. Date button opens a Radix portal calendar only on click; selection closes it. Time button opens a separate hour/minute picker using the installed Radix Select primitives; Set time explicitly commits the chosen 24-hour value. Each value can be cleared independently. Unique field IDs and keyboard/focus handling use the existing primitives. Portal stacking avoids the previous scroll-container clipping, without keeping a calendar permanently open.
- [x] Keep date/time as separate form values and combine to the existing UTC starts_at contract only when both are entered. Neither value is required when scheduling is omitted; a partial schedule shows a clear completion hint and prevents Save instead of inventing midnight. Calendar date labels format in UTC to avoid date-only display shifts across browser time zones; saved event time retains the established local-time-to-UTC conversion. No API or database change.
- [x] Use only the existing canvas/surface/border/text/accent CSS variables for new controls, calendar selections, time dropdown highlights, focus rings and actions. Online/Physical selections use accent-tinted surfaces. No hard-coded black/white/yellow palette or extra dependency.

Changed: ui/src/yullo/forms/{core/DateTimeField.tsx,subspaces/Subspaces.tsx}. Verification: TypeScript/production UI build, focused UI static scans and diff checks passed. No new tests or browser tests were run. Pending approval: rendered desktop/mobile comparison with the reference, all configured themes/accents, date/time popup focus/dismissal, partial schedules, local-time/UTC round trip, online/physical flow and Save integration in an isolated namespace. Build success does not verify the rendered appearance.

### Direct time entry and browser verification — 2026-11-13

User approved read-only browser checks, then requested removing the time popup/Set time step. Updated only forms/core/DateTimeField.tsx to use the installed React Aria TimeField directly in the form: editable hour/minute segments, immediate value updates, 24-hour format, keyboard navigation, themed focus and clear-time action. Removed the temporary time-popup state, TimeUnit helper and Radix Select import; Date retains its on-click calendar. Existing date/time values, completeness check and UTC Save contract are preserved.

Verified in native Chrome against the local authenticated dashboard: compact event layout visible, calendar closed initially and opened without clipping, earlier hour/minute popup functioning before the requested simplification; after simplification, hour 09 and minute 30 were typed directly into the field and the form showed 09:30 with no time popup or confirmation button. No event was saved, published or seeded. The browser access host was unavailable, so native Chrome was used; initial local connection refusal resolved when the existing frontend resumed. No backend restart or database action. TypeScript, production build, focused UI scans and diff checks passed. Only the current desktop dark/yellow appearance was visually inspected; mobile, other theme/accent combinations, Google Maps and durable Save integration remain unverified.

### AM/PM display — 2026-11-13

User requested 12-hour time. Changed the existing inline React Aria TimeField to hourCycle=12, exposing its editable AM/PM segment alongside hour/minute, and updated the helper copy. Internal Time serialization and UTC conversion remain unchanged, so AM/PM selection maps to the proper saved hour. TypeScript and diff checks passed. No new tests or repeat browser checks for this small display change.

### Direct entry plus time chooser — 2026-11-13

User requested both direct selection and an opening time picker. Retained editable AM/PM hour/minute segments; clicking them also opens a compact Hour/Minute/Period chooser while preserving input focus. A clock button provides a separate explicit trigger. Chooser changes apply immediately to the same time value; Done only dismisses it. Conversion correctly maps 12 AM to 00 and 12 PM to 12. Existing date calendar, validation, UTC saving and theme/accent variables remain intact. Changed forms/core/DateTimeField.tsx only. TypeScript and diff checks passed; no browser access, per the user's preference. Popup interaction remains unverified.

### Event side panel — 2026-11-13

User requested event creation open from the side like existing entity editors. Updated forms/subspaces/Subspaces.tsx to match the BookingForm drawer: right edge, full height, max 640px desktop width, full viewport width on mobile, left border/shadow and rounded left corners on wider screens. Header is compact with a separator; existing scrollable form, date/time chooser/direct entry, location modes, Google Maps, save and focus trap remain intact. Uses the existing motion/react library with a 200ms right-to-left entrance and reduced-motion support. Other quick forms retain their centered dialogs. TypeScript and diff checks passed; browser was not accessed per user preference.

### Shared side panel for all quick forms — 2026-11-13

User requested the same side-panel behavior for Posting, Service, Other and all remaining quick forms. Removed event-only presentation branches from AddSubspace: every quick-create type now shares the right-side 640px drawer, mobile full-width layout, entrance/reduced-motion behavior, header, scrollable body, spacing and footer. Classification-specific fields and existing save/context handling remain unchanged. TypeScript, motion and diff checks passed. No browser access, per user preference.

### Space-page typed listings — 2026-11-13

User requested the listing flow directly on the Space page, including the linked local dashboard. Added Events/Postings/Services/Other entry rows with actual owned-child counts to SpaceDashboard. Each opens a right-side list drawer, sharing the existing Subspaces component and owner-keyed hierarchy query; the header + category icons now open the same typed listings. A + inside each list opens its existing type-specific creation drawer. Clicking a listed item opens its normal Space dashboard. Other groups classifications outside Event/Posting/Service, preserving discovery of legacy Space/Job/Project/Location/Community children. Existing link, classification, detach, empty/loading/error/retry and reduced-motion behavior remain; existing-Space link choices respect the active category. No API, schema, source ingestion or publication changes. Graph navigation and its creation menu remain available.

Changed ui/src/yullo/{forms/subspaces/Subspaces.tsx,screens/SpaceDashboard.tsx}. TypeScript passed; final build/diff checks recorded below. Browser not accessed per user instruction; listing/dialog integration remains unverified.

Completion: production UI build, TypeScript, focused UI scans and diff checks passed. No browser access or durable test records created.

### Bottom expandable listings — 2026-11-13

User requested the typed listing links at the bottom under an expandable section matching the dashboard. Moved the existing listing component below Appearance inside a default-collapsed native details section titled “Events, posts & services.” Uses existing row typography, dividers, spacing, theme text and accent focus tokens, plus a stateful chevron. Existing header +, listing counts, category side panels, creation, link and detach functionality are preserved. Changed SpaceDashboard.tsx only; no duplicated listing implementation. TypeScript/diff checks passed; no browser access.

### Single combined listing — 2026-11-13

User found the empty per-category Posting sidebar confusing and requested a single listing option with a button opening a styled sidebar. Replaced the four category listing buttons with one All items row and View action inside the existing bottom expandable section. View opens one right-side drawer containing all child classifications; removed filter state/helpers and per-category empty-list flows. Sidebar uses the same theme-aware drawer, title/parent subtitle, one + for creation, linked item rows and a clear “Nothing added yet” empty state. Header + category icons create directly again; sidebar + uses the same four creation choices. Link-existing remains under More options, preserving functionality without presenting it as the primary action. Existing classification/detach actions remain. Raised the shared + popover above drawer stacking so it works inside the sidebar. Existing open-Space links, save and backend behavior unchanged.

Changed forms/subspaces/Subspaces.tsx and SpaceDashboard.tsx copy. TypeScript passed; build/static checks recorded at completion. No browser access per user instruction.

Completion: production build, TypeScript, UI static scans and diff checks passed. Combined-list/drawer interactions remain browser-unverified; no browser accessed or records created.

### Direct listing row — 2026-11-13

User explicitly removed the expand/collapse requirement. Replaced the bottom disclosure with one always-visible “Events, posts & services” row, matching Identity/Appearance typography, description, spacing and action alignment. View opens the existing combined sidebar directly. Removed the unused disclosure chevron import. No creation/listing/backend behavior changes. TypeScript and diff checks passed; no browser access.

### Content listing empty state — 2026-11-13

- Replaced `Nothing added yet` with an encouraging invitation and an inline + action reusing `AddSubspace` and its existing type menu/forms. Archived/inactive Space creation restrictions preserved.
- File: `ui/src/yullo/forms/subspaces/Subspaces.tsx`. Type-check and whitespace check passed; browser/tests not run.

- View panel empty-state copy refined to “What’s happening in your Space?” with an invitation to share an event, post or announcement. Copy only; whitespace check passed.

- Events/posts/services empty-state section now uses the configured accent for its subtle background and border; existing text/surface/action tokens retained. `Subspaces.tsx`; type-check and whitespace check passed. No browser/tests run.

### Add control polish — 2026-11-13

- View panel shows one +: in the empty invitation when empty, in the header once items exist. Reuses the same action/menu and permission checks.
- Shared Space add button has a bolder plus, translucent glass treatment, accent tint/border and theme-aware highlight; category icon strokes strengthened.
- Files: `Subspaces.tsx`, `tokens.css`. Type-check and whitespace check passed; browser/tests not run.

### Consistent form accent mapping — 2026-11-13

- Fixed undefined `--accent` / `--accent-fg` aliases by mapping them to canonical Yullo tokens, with defaults for portal/form controls. This is scoped to Yullo and also fixes existing focus/selection references.
- Warm theme retains warm surfaces but no longer blends brown into the chosen accent. Dark modes retain their readable accent ink mapping.
- Space type menu and location icons follow the chosen accent; empty-state container uses neutral themed surfaces so the glass add action remains the focal point.
- Files: `tokens.css`, `Subspaces.tsx`, `Locations.tsx`. Frontend type-check and whitespace check passed. Browser/tests not run; rendered combinations remain unverified. No data or flow changes.

### Vivid yellow and category icon colors — 2026-11-13

- Yellow accent is now #FFFC00; removed the brown yellow-ink variant, using neutral ink for readable light-theme labels and vivid yellow ink in dark themes.
- Restored distinct theme-aware category colors in the multi-icon Space menu and knowledge source chooser. Actions/selection retain configured accent.
- Files: `tokens.css`, `Subspaces.tsx`, `AddKnowledgeModal.tsx`. Type-check and whitespace check passed; no browser/tests run.

### Yellow button edge — 2026-11-13

- Approved 1px charcoal border for solid yellow buttons/links on light and warm themes; softer theme border in dark modes. Other accent selections unchanged. Rule is scoped to Yullo solid-accent actions.
- `tokens.css`, `AddKnowledgeModal.tsx` (canonical action classes for shared styling). Whitespace check passed; no browser/tests run.

### Generic editable description prompt — 2026-11-13

- Moved the inline description-generation prompt into `app/orchestra/ai/prompts/yullo/quick_description.py`; `quick_context.py` imports it. Existing provider fallback, validation and owner-approved suggestion application remain intact.
- Prompt handles any event without assuming food, audience or activities; requests an inviting opening, known When/Where details and bracketed placeholders for missing details. Other Space types retain appropriate copy rather than event formatting. No parent knowledge is injected.
- Kept the existing shared 280-character overview contract to avoid changing main identity/profile schemas. UI suggestion includes a review/placeholder reminder. No auto-save or auto-publish introduced.
- Files: prompt module, `app/yullo/services/spaces/quick_context.py`, `ui/src/yullo/forms/subspaces/Subspaces.tsx`.
- Python syntax, frontend type-check and whitespace checks passed. No new tests, model calls, browser access or data writes; actual model output remains unverified.

### Preserve theme on AI request token refresh — 2026-11-13

- Traced event AI action: no direct theme mutation; shared CSRF refresh reapplied `/auth/me` server preference through `setAuth`, potentially replacing a locally selected theme during generation (also affects SSE token refresh).
- `ui/src/yullo/api/client.ts`: refresh updates user/token while omitting optional theme argument, preserving current UI preference through existing store behavior. Initial sign-in preference loading and auth failure handling unchanged.
- Type-check and whitespace check passed. No browser/tests run; actual user-reported trigger not reproduced, so this is a confirmed overwrite path fix rather than verified reproduction.

### Fill overview placeholders from event selections — 2026-11-13

- `Subspaces.tsx`: selecting a venue resolves explicit venue placeholders in both the overview and pending AI suggestion. Online links resolve placeholders on blur; completed date/time selections resolve `[Date and time]` using local formatting.
- Only recognized bracketed placeholders change; custom prose and already concrete values remain untouched. No further AI call, save or publication. Replacements exceeding the existing 280-character limit leave the text unchanged for manual editing.
- Frontend type-check and whitespace check passed. Browser/tests not run; interactive integration remains unverified.

### Hide child Spaces from main Space list — 2026-11-13

- Home snapshot carries canonical `parent_space_id`; Home response Space listing includes only parentless Spaces. Attached events/postings/services remain accessible in the parent's View panel.
- All owned Spaces remain in the factual snapshot, preserving metrics, attention and knowledge behavior. Detached children naturally return to the main list. No data writes or migrations.
- Files: `app/yullo/services/home/repository.py`, `app/yullo/services/home/service.py`. Python syntax and whitespace checks passed; no browser/tests run. Existing incorrectly parentless records are not modified.

- Home error follow-up: confirmed current repository joins `YulloSpace` and reads the selected parent ID instead of accessing nonexistent `Space.parent_space_id`. Runtime traceback corresponds to earlier code. SQLAlchemy PostgreSQL query compilation passed without querying a database (local verification required `DEBUG=false` because shell DEBUG was `release`). Backend must reload corrected code; endpoint execution remains unverified.

### Clear child listing rows — 2026-11-13

- View drawer lists children with a colored semantic icon, separate title and type/status line, and Open arrow. One accessible link per item avoids the previous concatenated name/type appearance.
- Existing header + creation action and classification/detach options retained; options trigger now uses a consistent MoreHorizontal icon and tooltip. No lifecycle or data changes.
- File: `ui/src/yullo/forms/subspaces/Subspaces.tsx`. Type-check and whitespace check passed. No browser/tests run; rendered integration unverified.

### Nested public URLs and parent breadcrumbs — 2026-11-13

- Approved URL shape: `/parent-handle/child-handle`, extended to deeper hierarchy using existing globally unique handles. No handle rewrite or migration; existing flat URLs still work.
- Added `GET /api/v1/yullo/public/paths/{public_path:path}`. Each segment must match a current parent link, same owner, active Yullo Space and live lifecycle; top segment must be parentless. Invalid/private paths return generic 404. Child rendering reuses canonical public projection and disclosure rules; no parent knowledge enters child Aura.
- Shared root SlugResolver resolves nested Yullo URLs, preserving CustomerChat fallback for existing Support247 two-segment URLs. HttpAuraProvider encodes each path segment and uses the new endpoint only for nested paths.
- Dashboard public link and Identity form handle display use a shared cycle-guarded hierarchy branch helper. Header breadcrumb includes ancestors: Home / parent / child.
- Files: `app/yullo/api/public.py`; `ui/src/App.tsx`, `ui/src/SlugResolver.tsx`, `ui/src/yullo/api/spaces.ts`, `ui/src/yullo/services/aura/HttpAuraProvider.ts`, `ui/src/yullo/screens/SpaceDashboard.tsx`, `ui/src/yullo/components/YulloAppHeader.tsx`, `ui/src/yullo/forms/identity/IdentityForm.tsx`.
- Python syntax, frontend type-check, production build and whitespace checks passed. No browser, new tests, live model calls or database writes. Pending: live verification of nested published child, draft/foreign/wrong-parent denial, old flat link and Support247 fallback. Changing parent/ancestor handles changes the nested URL; flat child links remain usable under their existing publication checks.

### Aura public child-event listing tool — 2026-11-13

- Approved exception to current-Space-only retrieval: `list_events` exposes only public listing summaries for direct event children. It does not retrieve child sources/facts, share Aura context, or delegate to child Aura. Publishing an active event and linking it to this published same-owner parent makes it listable; detach/archive/unpublish removes eligibility on the next call.
- Reused hierarchy service (`list_public_child_events`, `build_event_listing_tools`), canonical `get_public_entities`, and public field-policy projection. The projection's optional `direct_only` flag excludes on-request fields for listings; defaults preserve existing callers. Public/active/review checks remain canonical. Current Space ID is bound outside model arguments.
- Inputs: bounded title search, optional timezone-aware date bounds, bounded result count. Unknown/ambiguous schedules remain unknown and are excluded by date filters. Results carry title, public profile description, approved matching event schedule/location/registration details, working flat public URL, `as_of` and `has_more`. Date ordering uses absolute instants. No invented dates or copied parent context.
- Bounded candidate scan (default 50) and result limit (default 10, maximum 20); incomplete scans set `has_more`. Failures report unavailable rather than empty. Structured logs contain only safe IDs/counts/error class.
- Existing response preparation accepts optional product-injected tools, leaving retrieval/search/continuation/extraction/presentation unchanged. Yullo adapter supplies the tool; conditional instructions live in existing prompt composer. No new AI/provider pipeline, tables, migrations, endpoints or duplicate event store.
- Configuration: `YULLO_EVENT_LISTING_ENABLED`, `YULLO_EVENT_LISTING_MAX_RESULTS`, `YULLO_EVENT_LISTING_MAX_CANDIDATES` in existing validated inference configuration and `.env.example`.
- Files: `.env.example`, `app/yullo/config/inference.py`, `app/yullo/services/spaces/hierarchy.py`, `app/yullo/services/entities/payloads.py`, `app/yullo/api/public.py`, `app/orchestra/ai/inference/streaming.py`, `app/orchestra/ai/prompts/yullo/composer.py`.
- Verification: Python syntax/imports, actual Agno Function construction/schema, preparation hook/configuration and conditional prompt inspection passed; whitespace check passed. No browser, database queries/writes, live model calls or test suite run. Pending approval: existing focused tests, isolated integration for draft/foreign/private/field-policy/date boundaries and real tool selection. Newly saved quick-form dates may remain unavailable until canonical extraction/review produces an approved matching event record.

### Distinct child summary and event-local venue — 2026-11-13

- Child dashboard leads with type/parent identification, description and, for Event children, schedule with AM/PM/local timezone and venue. Unknown details are clearly unconfirmed. Existing management rows remain mounted inside one animated, keyboard-accessible More options disclosure; reduced motion respected. Locations remains visible at the bottom. Main Spaces retain expanded management rows.
- New event creation uses canonical `create_owner_entity` in its existing transaction to save owner-confirmed, private event-local venue (`event-venue`) and schedule (`space-event`) records. Event links to that location. No company locations copied; no ingestion/extraction/review steps bypassed or disabled. Existing source/outbox still saved/dispatched. Optional schedule remains optional.
- Owner Identity response adds read-only `event_context`, derived only from the deterministic original saved-form source (current Space ID + stable creation key). Reads through existing blob storage when needed. No arbitrary source mining, no public disclosure, no durable duplicate context field.
- Existing events can display source-backed venue previews in Locations when no location records exist. Save location opens the existing editor prefilled with that event venue, preserving publication choice and avoiding automatic writes on GET. Existing archived canonical venue suppresses fallback. GPS cannot overwrite the restored form values. Previously stored events are not silently backfilled.
- Files: `app/yullo/services/spaces/quick_context.py`, `app/yullo/services/persistence/identity.py`, `app/yullo/schemas/forms/identity.py`; `ui/src/yullo/api/forms.ts`, `ui/src/yullo/api/entities.ts`, `ui/src/yullo/screens/SpaceDashboard.tsx`, `ui/src/yullo/forms/Locations.tsx`, `ui/src/yullo/forms/LocationForm.tsx`.
- Python syntax/import checks, frontend type-check/production build and whitespace checks passed. No browser, test suite, database queries/writes, migrations or live AI calls. Pending approval: existing focused tests and interactive event creation/legacy venue restoration verification.

### Always-visible child management sections — 2026-11-13

- User reversed the More options disclosure decision. Removed its trigger, animation wrapper and state from `SpaceDashboard.tsx`; management sections are always visible again. Event summary and event-local location behavior retained.
- Frontend type-check and whitespace check passed. No browser/tests run.

### Event listing images, multi-image sources and saved-details parser fix — 2026-11-13

- Approved four-part scope implemented in code: larger child listing rows with cover thumbnail, type/status, local date/AM-PM time/timezone and venue; optional cover image in all quick-create forms; multi-image knowledge uploads; source parser filename correction.
- Shared `forms/core/ImageField.tsx` replaces Identity's duplicate upload/preview/replace/remove/URL code and is reused by quick-create. Uses existing `Space.logo_url` storage; service validates image formats, base64 and 5 MB limit / HTTP(S) image URLs. Stable create retries detect conflicting cover values. No new image table or storage pipeline.
- Hierarchy endpoint accepts optional owner-checked `details_for` parent ID. Only that parent's children receive cover/schedule/location fields; graph and breadcrumb requests stay lightweight. Existing canonical entity data wins; original saved-form context provides legacy fallback. Details stay in the owner API, not general model/public responses.
- Knowledge adds an Images tab and Add images shortcut. Up to 10 PNG/JPG/WebP files use existing single-file source acceptance, storage, jobs, image parser, extraction and review, bounded by the existing 20 MB per-file backend limit. Per-file queued/uploading/submitted/failed states; retry skips successes. No parallel ingestion implementation or new upload endpoint. Single-document flow remains available.
- Read-only database diagnosis confirmed source error: unsupported parser filename `Saved Space details`. Yullo ingestion now parses using the stored blob suffix; optional `display_name` preserves human-readable indexing/citation labels. Support247 parsing unchanged. Text source UI says Saved text rather than exposing generated blob filenames.
- Files: `app/orchestra/ai/ingestion/{orchestration,pipeline}.py`, `app/api/v1/yullo_onboarding.py`, `app/yullo/{api/space_forms.py,schemas/spaces.py,schemas/forms/identity.py,services/persistence/identity.py,services/spaces/hierarchy.py}`; `ui/src/yullo/{api/forms.ts,api/spaces.ts,forms/core/ImageField.tsx,forms/identity/IdentityForm.tsx,forms/subspaces/Subspaces.tsx,components/AddKnowledgeModal.tsx,screens/knowledge/AuraKnowledgeScreen.tsx}`.
- Verification: backend imports (using normal jobs-first import order), frontend type-check/production build, whitespace checks passed. No browser or tests run. Read-only source status query completed; no database changes made.
- BLOCKED pending explicit approval: automatic approval review rejected retrying the real source because retry updates DB and processes private content with configured providers. No retry executed or workaround attempted. Configured text destinations (configuration only, not availability verified): Modal `millionsilluminate--hierarchy-extractor-api-v2-serve.modal.run`, Fireworks, OpenAI, OpenRouter, Together. Source remains failed until an approved retry. Existing focused tests and live image/AI flow checks remain pending.

### Generic subspace section copy — 2026-11-13

- Child Spaces of any type use Details / Edit details, What Aura knows (page-focused helper text), Links & actions / Manage links, Page design / Customize page, Related spaces, and location guidance for physical/online places.
- Main Space labels retain their previous wording. Shared BookingLinks and Locations accept a small optional subspace flag; hierarchy supplies the existing parent classification for Related spaces. Copy-only change; no storage, upload, booking or disclosure behavior changed.
- Files: `SpaceDashboard.tsx`, `BookingLinks.tsx`, `Locations.tsx`, `subspaces/Subspaces.tsx`. Frontend type-check and whitespace check passed. No browser/tests run. Prior live source retry remains blocked pending explicit approval; no retry attempted by this change.

### Type-specific child section wording — 2026-11-13

- Approved change replaces generic child copy with the current type: Event/Post/Service/etc. details, Edit event/post/service, What Aura knows about this type, type-specific links/actions and page design, and type-specific location guidance. Related-spaces helper refers to the current type.
- Summary retains Part of parent and adds “Changes here apply only to this {type}.” Main Spaces retain original wording.
- Shared `spaceItemLabel` maps posting to post and Other to item. No custom Other label field currently exists; fallback is honest rather than inventing a type. Existing component flags replaced by a single optional item label for shared copy.
- Files: `ui/src/yullo/api/spaces.ts`, `screens/SpaceDashboard.tsx`, `forms/BookingLinks.tsx`, `forms/Locations.tsx`, `forms/subspaces/Subspaces.tsx`. Frontend type-check and whitespace check passed. Copy-only; no browser/tests, data changes or source retry.

### Yullo browser-tab branding — 2026-11-13

- Shared HTML defaulted to Support247's title/favicon, and RouteSeo had no Yullo branch. Added yellow Y favicon and early product-aware title/icon selection for yullo.co/subdomains and explicit /yullo routes.
- RouteSeo preserves Yullo title/icon/theme color on navigation, replaces Support247 social text with Yullo metadata, removes unrelated Support247 structured data/social images, and keeps known private Yullo routes noindex. Support247 icon/metadata restored outside Yullo; existing tenant title handling retained.
- Files: `ui/public/yullo/favicon.svg`, `ui/index.html`, `ui/src/lib/RouteSeo.tsx`. Type-check, production build and whitespace check passed. No browser or tests run; no deployment performed. Screenshot's CORS/auth failures are separate and unchanged.

### Production Yullo CORS configuration applied — 2026-11-13

- User authorized updating GitHub Secrets and applying existing deployment. Updated repository `akhilsahu/support_triage` secret `CORS_ORIGINS` to allow https://support247.chat, https://www.support247.chat, https://yullo.co and https://www.yullo.co. Other secrets unchanged; no secret values read or logged.
- Confirmed current remote main equals latest successful deployment commit `1973fa12c1f15746e4b7b6f28b7d626ac65be257`. Reran only Build on VPS and restart from Actions run 43235384324. Deployment completed successfully; no local source changes committed/pushed.
- Live verification: health endpoint returned HTTP 200 with exact matching Access-Control-Allow-Origin and credentials=true for all four origins. Yullo Home OPTIONS preflight returned 200 permitting https://yullo.co. No browser session or authenticated Home request tested.
- Remaining distinction: CORS is fixed live; cross-site SameSite cookie behavior is independent. Vercel same-origin proxy/VITE_API_URL configuration and authenticated sign-in verification remain separate follow-up if 401 persists.

### Public landing incorrectly fetching private Home — 2026-11-13

- Root cause of Home 401 on landing: `DynamicHome` in shared `screens/home/ThemeSwitcher.tsx` directly rendered private `YulloHome` for Yullo hostnames without the private route guard. Public `/` therefore fetched `/api/v1/yullo/home` even for visitors.
- Changed only that product branch to render existing `YulloLanding`. Protected `/yullo/home` route remains unchanged; no auth check removed and no API made public. Support247 homepage variants unchanged.
- Frontend type-check and whitespace check passed. No browser/tests run. Local code fix only: no commit/push/frontend deployment performed. Existing cross-site session issue remains separate for authenticated dashboard requests.

### Landing fix deployed to production — 2026-11-13

- User explicitly authorized deployment. Published only the two-line `ThemeSwitcher.tsx` fix against current remote main using GitHub Contents API; all unrelated local changes excluded. Commit: `a4960174052d06b1ec39708b4a6963f60801e527`.
- Vercel production deployment EEWv57ikCmsi7ExFvMkFDW7azkBj succeeded; deployment record 7773071536. Verified https://yullo.co/ HTTP 200, new entry `/assets/index-DGwpufMD.js`, Yullo hostname branch rendering `YulloLanding`, and public landing chunk HTTP 200. No browser/session automation used.
- Automatic CI & Deploy run 43481743761 completed successfully: backend tests/print hygiene, frontend type-check/lint/tests and VPS build/restart. Live API health returned 200 with https://yullo.co allowed and credentials enabled after deployment.
- No unrelated local changes committed or pushed. Local workspace remains dirty and was not reset/rebased; remote main now contains the isolated deployment commit. Authenticated cross-site session/proxy behavior remains a separate follow-up.

### Auth button visibility deployed — 2026-11-14

- User approved immediate styling/deployment for /yullo/auth. Root cause: public auth sits outside dashboard token provider, so accent variables were undefined; deployed Google button also had invalid transparent-border utility classes.
- Added isolated `ui/src/yullo/styles/auth.css`: explicit #FFFC00 and dark ink variables, 1px charcoal borders for auth buttons, visible focus/disabled states. Auth root imports stylesheet and carries `yullo-auth` class. No auth behavior changes or Support247 styling changes.
- Built/type-checked locally. Released only the stylesheet plus root import/class against remote main, excluding unrelated dirty workspace files. Commit c13f43cde66ebb9c015ca7bd05dc16ab15d074ca; Vercel AX1abhTMkmbCk3bEUVrVYVqLtRze production succeeded.
- Verified live auth HTTP 200, root class in deployed JS and #FFFC00/charcoal border rules in deployed YulloAuth-DU527pRK.css. No browser/login attempted. Frontend and backend CI checks passed; automatic VPS rebuild was still running at verification time (Actions 43483048084).
- Confirmed separate existing issue: remote production GoogleAuthButton still simulates a mock sign-in payload. User informed; this release deliberately changes visual styling only. Real Google Identity integration exists among local unrelated/unreleased changes and was not swept into this deployment.

- Follow-up: Actions run 43483048084, including the automatic VPS build/restart, completed successfully. Auth styling release and associated CI/deployment are complete.

### Optional event booking link — 2026-11-14

- Event quick-create now includes an optional Booking or registration link alongside existing service/job link fields, reusing `QuickSpaceContext.destination_url` and its existing source text. Blank remains valid; event input requests HTTPS, with authoritative server validation through the action schema.
- `save_event_records` creates a canonical owner-confirmed/private booking action (`event-booking`) through `create_owner_entity`, inside the same event creation transaction. It appears in the existing links manager; no duplicate URL field in the event entity, new schema, table or endpoint.
- Files: `ui/src/yullo/forms/subspaces/Subspaces.tsx`, `app/yullo/services/spaces/quick_context.py`. Frontend type-check, backend syntax/import and whitespace checks passed. No tests/browser/data writes/deployment run; optional-link flow remains live-unverified.

### Local Celery startup diagnosis — 2026-11-14

- Inspected local worker logs: exits with ModuleNotFoundError for aiofiles. Dependency already exists in requirements.txt/pyproject.toml; running Docker image needs rebuilding, rather than another dependency declaration.
- `docker-compose.yml`: removed obsolete version key and replaced inherited API HTTP healthcheck on celery-worker with a targeted Celery ping using escaped container HOSTNAME. Compose config/whitespace validation passed.
- No containers stopped/rebuilt/restarted and no data jobs triggered. For debugger-based API development, start only postgres/redis/adminer/celery-worker with --build --wait; leave the separate Python API on 8001. Actual rebuilt-worker startup remains unverified.

### Local Celery worker repaired and verified — 2026-11-14

- User explicitly requested runtime fix. Rebuilt/started only postgres, redis, adminer and celery-worker. First rebuild fixed missing aiofiles but revealed Kombu's newer transport requiring redis-py >=6.1 while project pins redis-py 5.0.1.
- Constrained Celery >=5.3.6,<5.4 and Kombu >=5.3.4,<5.4 in requirements.txt and pyproject.toml, preserving Redis client 5.0.1 and existing queue contracts. Rebuilt worker again; Compose --wait succeeded.
- Verified actual installed aiofiles 25.1.0, Celery 5.3.6, Kombu 5.3.7, redis-py 5.0.1. Worker status running/healthy using Celery ping. Postgres/Redis/Adminer healthy. Python debugger still listens on 8001.
- Files: docker-compose.yml (previous healthcheck/version fix), requirements.txt, pyproject.toml. Whitespace and Compose validation passed; no new tests or synthetic ingestion jobs added. Worker resumes normal existing queue processing.
- Existing unused multiagent-api container remains unhealthy and untouched; targeted startup command excludes it. No production changes/deployment or database deletion performed.

### Creation form icon tooltips — 2026-11-14

- Replaced native-title-only assistance hints with Radix tooltips: Generate description with AI, Copy parent Space description, Undo last fill, creation close, cover removal, time picker/clear and calendar month navigation. Shared form controls benefit across event/post/service/other creation.
- Added small reusable `forms/core/IconTooltip.tsx`, using existing Radix library, portal z-index above drawers and existing theme tokens. Disabled assistance controls can expose a reason through a focusable wrapper; native button disabled state preserved. Tooltips appear on hover/focus without changing click actions.
- Files: `forms/core/IconTooltip.tsx`, `forms/core/DateTimeField.tsx`, `forms/core/ImageField.tsx`, `forms/subspaces/Subspaces.tsx`. Frontend type-check and whitespace checks passed. No browser/tests/deployment run; interactive tooltip integration remains unverified.

### Auth alignment refinement — 2026-11-14

- Local screenshot showed 360px Google button alongside 420px fields and a second vertical divider caused by nested auth layout. Auth form now uses one centered responsive max-400px column on desktop/mobile; main owns the single desktop divider, and AuthPanel no longer adds another viewport-height/border layer.
- Google Identity render width tracks its actual container through ResizeObserver, capped at Google's documented 400px maximum. Button re-renders only on a width change; observer disconnects on unmount. Existing provider initialization/token callback unchanged; no iframe CSS or fake auth substitution.
- Files: `components/auth/GoogleAuthButton.tsx`, `components/auth/AuthPanel.tsx`, `screens/YulloAuth.tsx`. Frontend type-check and whitespace checks passed. No browser/tests/deployment run; visual responsive verification pending.

### Write or improve overview with AI — 2026-11-14

- Overview helper renamed Write or improve with AI. Dedicated static accent/category tint and small glow distinguish Bot icon without sparkles or looping motion. Persistent explanatory tooltip is shown per newly opened form until the AI action is used; Escape dismisses the hint without closing the creation form. Other icon tooltips retain normal hover/focus behavior.
- Request reuses existing description generation endpoint/provider chain, with current overview, name/type, schedule, venue/format/coordinates, online and booking links. Existing context already included these fields; no second generation pipeline added. Added optional validated IANA time_zone to generation request only, converting starts_at server-side to the supplied local offset for readable AM/PM copy. Saved schedule/storage unchanged.
- Prompt in existing Yullo prompt directory explicitly rewrites rough notes or existing copy for grammar/clarity and creates fresh copy when blank, combining supplied context and retaining facts without inventing details. Existing 280-character contract, suggestion review, explicit Use description and Undo behavior retained.
- Files: `forms/core/IconTooltip.tsx`, `forms/subspaces/Subspaces.tsx`, `styles/tokens.css`, `app/yullo/schemas/spaces.py`, `app/yullo/services/spaces/quick_context.py`, `app/orchestra/ai/prompts/yullo/quick_description.py`.
- Frontend type-check, backend schema/service imports and whitespace checks passed. No tests/browser/provider calls/data writes/deployment run. Live AI output and visual hint placement remain unverified.

### Stronger AI helper emphasis — 2026-11-14

- User screenshot showed previous yellow halo was too faint. Replaced it with a visible 2px blue/violet/teal/accent border, distinct static colored shadows, neutral theme surface and larger 18px Bot icon in a minimum 36px desktop target. Mobile retains larger existing target. No animated/looping glow.
- Increased tooltip separation to 14px and prevented incidental hint text selection. Tooltip/action behavior unchanged.
- Files: `styles/tokens.css`, `forms/core/IconTooltip.tsx`, `forms/subspaces/Subspaces.tsx`. Frontend type-check and whitespace check passed; no browser/tests/deployment run. Rendered appearance remains unverified.

### Compact accent-tinted tooltips — 2026-11-14

- Shared icon tooltip now uses a thin charcoal border (theme-visible neutral in dark modes), selected-accent tint over theme surface, smaller 224px max width/padding and 11px/16px type. AI hint description shortened without changing input context or behavior.
- Files: `forms/core/IconTooltip.tsx`, `forms/subspaces/Subspaces.tsx`, `styles/tokens.css`. Type-check and whitespace check passed. No browser/tests/deployment run; rendered appearance unverified.

### AI hint follows overview content — 2026-11-14

- Removed always-open AI tooltip behavior and its per-form hint state. AI glow now appears only when overview contains non-whitespace text; clearing the overview removes it. Tooltip is available on hover/focus only when that text exists. Empty-overview generation remains available using the existing name/context validation.
- Simplified shared IconTooltip by removing unused persistent-hint controls and adding a small enabled guard. Other icon tooltips retain their existing hover/focus behavior.
- Files: `subspaces/Subspaces.tsx`, `core/IconTooltip.tsx`. Type-check and whitespace check passed. No browser/tests/deployment run.

### AI tooltip on hover and first overview entry — 2026-11-14

- Clarified behavior: AI tooltip always available on hover/focus, including empty overview. First non-whitespace typed/pasted overview text in each newly opened form also shows the hint automatically for 3 seconds. It is not retriggered on every keystroke. Clearing text, dismissal or clicking AI closes the automatic hint; timers clean up.
- Glow remains conditional on nonempty overview. Shared tooltip now supports the small timed external hint instead of the unused enabled guard. Other icon behavior unchanged.
- Files: `forms/core/IconTooltip.tsx`, `forms/subspaces/Subspaces.tsx`. Frontend type-check and whitespace check passed. No browser/tests/deployment run.

### Enriched subspace descriptions — 2026-11-14

- User approved 200–300-word descriptions rather than 280-character summaries. Existing canonical description JSON field now supports up to 4,000 characters for attached subspaces; main Space profile remains 280. No parallel long-description store, table or migration.
- Introduced bounded description constants and authoritative scope-aware validation in create/update services (including non-UI entry points). Create/update request envelopes and owner response accept child-length content; main profile base schema remains unchanged. Owner response includes canonical parent_space_id so the editor selects the correct limit.
- Child editor uses an extended frontend validation schema and larger text area/counter; main editor uses original 280-character schema. Quick-create/helper placeholder filling and AI response validation now share the 4,000-character child bound. Long suggestions use a bounded scrollable preview.
- Dedicated quick-description prompt requests approximately 200–300 words with engaging narrative, purposeful details and invitation, plus supplied schedule/location. Allows creative language while forbidding fabricated concrete facts/guarantees. Sparse input may produce a shorter useful draft rather than filler. Main public-profile prompt remains unchanged.
- Subspace editor AI assistance reuses that same endpoint/prompt rather than the main short-profile generator; generated text is a reviewable suggestion, not an automatic replacement. Current form description/context and local timezone retained. Main AI/category/website workflows unchanged.
- Aura profile schema/context composition accepts full bounded child descriptions, retaining main truncation/limit; child retrieval does not silently cut the accepted description to 280 characters. Existing values are not rewritten.
- Files: `app/yullo/schemas/{spaces.py,forms/identity.py,inference.py}`, `app/yullo/services/{persistence/identity.py,spaces/quick_context.py}`, `app/orchestra/ai/prompts/yullo/{quick_description.py,composer.py}`; `ui/src/yullo/api/{spaces.ts,forms.ts}`, `forms/subspaces/Subspaces.tsx`, `forms/identity/IdentityForm.tsx`, `screens/identity/IdentityFormScreen.tsx`.
- Frontend production build/type-check, backend API/persistence/prompt imports and whitespace checks passed. No tests, live model calls, browser, database writes or deployment run. Live generation, boundary behavior and save/edit round trip remain unverified pending focused checks approval.

### Publication-readiness error diagnosis and feedback — 2026-11-14

- User reported repeated toggle-live 503s for local Space de3f17eb-52dc-4a9c-a920-6b907f23cd41. Read-only checks found valid setup, one ready source with published index, readiness=True and current status still private. Historical failure likely occurred during processing, but its exact old status was not captured. No publication/data write performed.
- Readiness now accepts ready_to_review only with a published/indexed source, consistent with current ingestion and canonical review boundaries; review candidates are not auto-approved. Existing readiness states and setup/ownership guards retained. Source query explicitly constrains same-Space rows.
- Not-ready returns actionable HTTP 409 instead of misleading infrastructure 503 and emits a safe status log. Dashboard displays publishing failures inline, scoped to the current Space; pending click guard remains.
- Files: `app/yullo/services/spaces/publication.py`, `ui/src/yullo/screens/SpaceDashboard.tsx`. Backend import, frontend type-check and whitespace checks passed. Existing publication tests not run pending approval; no new tests, browser, database writes or deployment. Retry Make live explicitly once checks pass; no readiness bypass implemented.

- Follow-up read-only check: reported Space de3f17eb-52dc-4a9c-a920-6b907f23cd41 now has Space.status=live, lifecycle_status=live and readiness=True with one ready source. User's subsequent publication succeeded; assistant performed no publish/write.
- Two older sibling subspaces ffd50a03-4173-44ce-9392-169e40005721 and 3cdf9617-9bc4-4add-8b46-c59ffb949847 remain draft/not-ready with preview_failed source. Prior live source retry approval block remains; no recovery job triggered.

### Repeat publication conflict — 2026-11-14

- Follow-up 500 diagnosis: read-only inspection found the reported Space back in draft, context_version=published_version=6, and an existing publication event for that exact version. Identity response construction succeeds. The previous live snapshot did not establish that subsequent publication attempts succeeded.
- Publishing again inserted the same unique (space_id, dedupe_key), causing a database conflict. Reused the existing PostgreSQL conflict-safe insert pattern, ignoring only that precise duplicate event. Other database failures still propagate; readiness, ownership and transaction behavior retained.
- File: `app/yullo/services/spaces/publication.py`. Backend import and diff whitespace checks passed. No user data changed, browser used, tests run or deployment performed. End-to-end retry remains unverified; existing publication tests await user approval.

### Space dashboard cover — 2026-11-14

- Approved: display the existing uploaded image above the Space title. Reused identity.logo_url; no extra storage, upload field or backend change.
- Responsive bounded cover (160px mobile / 192px larger screens) uses object-contain to preserve the whole image and its proportions for portrait, square and landscape uploads. Theme surface fills unused space; existing theme border and rounded corners retained. Missing or failed images leave no cover box.
- File: `ui/src/yullo/screens/SpaceDashboard.tsx`. TypeScript check and diff whitespace check passed. No browser, tests, data writes or deployment; rendered appearance remains unverified.

### Image-inspired subspace appearance — approved 2026-11-14

Goal: responsive image/title header without letterboxed whitespace; one saved appearance for dashboard accents, Studio preview and public chatbot.

- [x] Replace wide dashboard cover with intrinsic-ratio bounded artwork beside title on desktop / above on mobile. Keep whole image, hide failed images.
- [x] Extend existing presentation JSON and frontend schema with optional validated hex accent; derive readable text/button colors in existing themeTokens. No new table or palette store. Dashboard reads saved presentation through identity, retains interface light/dark setting.
- [x] Extend existing appearance assistant and dedicated prompt with same-Space type/description and bounded image context from uploaded cover or selected Studio asset. Reuse configured provider fallback. Suggestions remain previewable and explicitly saved; manual preset/custom-color controls remain available.
- [x] Reuse uploaded cover as hero fallback in existing Studio/public renderer; fit images without cropping, without duplicating the hero renderer.
- [x] Verify frontend type/build and backend imports; inspect diff. Ask before tests/live model calls. Record verification and remaining limits here. No deployment authorized.

Implementation: optional `accentColor` remains in existing appearance JSON (no migration); presets and custom accents share one contrast resolver. Resetting a preset clears the custom override. Yullo preset/swatch uses #FFFC00. Identity response reuses the canonical appearance parser and Studio Save invalidates its cache. Header accents apply to subspaces only and do not replace interface light/dark colors. Foreground hero fallback uses the existing cover for side-image/image-background layouts; centered main Space identity stays unchanged. Chat send control uses accent contrast rather than link ink.

Existing appearance recommendation/command endpoints now supply type/name/description plus a maximum 768px raster thumbnail from selected same-Space active Studio asset or inline uploaded cover. Uses existing byte/pixel limits/storage/provider fallback, validates returned hero asset IDs, and keeps prompts in the existing prompt directory. No arbitrary remote URL fetch; URL-only or unsupported images fall back to text context. Configurable via `YULLO_APPEARANCE_ASSISTANT_IMAGE_ENABLED`; no image or content logging. No new endpoint, service, upload field or image copy persisted.

Files: `schemas/appearance.py`, `schemas/forms/identity.py`, `services/persistence/identity.py`, `config/appearance.py`, existing `appearance_preview/generate_appearance_suggestions.py` and `prompts/yullo/appearance.py`; frontend `api/forms.ts`, `SpaceDashboard.tsx`, existing appearance schema/themeTokens/AccentPicker/AppearanceInspector/AuraDesigner/SuggestionChips/AppearanceScreen/styles, public experience/AuraIntro/AuraComposer; `.env.example`, `DESIGN.md`.

Verification: frontend production build and subsequent TypeScript check passed; backend identity/appearance/public API imports and diff whitespace check passed. No tests, browser, live model request, saved appearance changes or deployment. Pending with approval: existing focused tests, live multimodal suggestion and visual/save round trip. To apply an image-derived look: Studio → Recommend an appearance (or Match my cover and content) → review preview → Save.

### Automatic artwork tint correction — 2026-11-14

- Follow-up approved gradient: header now uses a clearer 125° three-stop fade (28% artwork color → 12% → theme surface). Reuses the same derived/saved accent and surface tokens; no new palette, animation or setting. Whitespace check passed; rendered result not browser-verified.

- Screenshot showed global yellow fallback clashing with the red poster before Studio customization. Replaced that fallback with one shared local image-color hook (32×32 sample, saturated hue grouping, ignores transparent/neutral pixels). No model call or Save required for this default visual adaptation. Stale image samples are ignored on navigation; unreadable/CORS-restricted/grayscale images fall back to neutral instead of yellow.
- Dashboard subspace header uses a restrained image-colored gradient and border; removed description card's bright top stripe. Public link stays on one truncated line with full native title. Actual image proportions and interface light/dark mode retained.
- Shared hook also feeds Studio's existing public renderer and public chatbot for uncustomized subspaces. A derived isSubspace flag is projected by existing appearance/public responses; no new database field. Main Spaces keep their defaults. Saved owner/Aura choices and explicit custom colors override extraction; manual inspector changes mark owner provenance immediately so preview honors their choice.
- Files: new `appearance/hooks/useArtworkAccent.ts`; existing dashboard/public experience, appearance themeTokens/AppearanceScreen/PublicLinkPreview/API types, public Space type; backend appearance summary/public projection. Documentation updated. Frontend production build, backend appearance/public imports and whitespace check passed. No tests, browser, model calls, database writes or deployment; rendered red tint and cross-origin fallback remain unverified pending approved checks.

### Optional pricing and quick detail templates — 2026-11-14

- User authorized implementation: pricing initially unchecked; enabling shows fixed amount/currency, zero displays Free. No range/subscription/payment collection in this scope. Optional quick templates can be clicked or dragged into a detail area, edited and removed; custom labels/values supported, max eight. Keyboard/touch use the same add buttons, without a drag library.
- One shared DetailFields editor in quick-create and child Identity editing; one SubspaceInfo renderer in dashboard and existing public IdentityBlock, automatically shared by Studio preview. The editor uses existing accent/surface tokens. Native input validation plus shared frontend schema and authoritative backend models bound money/labels/values/unique IDs. Removing price clears amount/currency together.
- Canonical owner-authored page fields live in existing YulloConfig.settings.identity.subspace_fields, saved through current create/update/revision/owner transactions; main Space writes reject these fields. QuickSpaceContext carries creation/AI inputs but does not create a second persisted copy. Existing Offering amount/currency validation extracted into reusable PriceFields with unchanged validation behavior; no new table/migration or parallel pricing entity.
- Existing public Space/appearance summaries project this declared public profile content only for child Spaces; Aura profile reads the same current canonical values under existing Space live/authorization gates. No cross-Space context, automatic source approval or ingestion changes. Editing removes stale details from these consumers immediately through existing identity cache/revision flow.
- Files: existing entity payload/schema/identity services, public projection, appearance summary, Aura profile/composer; frontend Space/form/appearance/public types, create and Identity forms, dashboard/public IdentityBlock; new `forms/subspaces/{DetailFields,SubspaceInfo}.tsx`. No root artifacts or dependencies added.
- Verification: frontend TypeScript/production build, backend identity/appearance/public imports and whitespace check passed. No tests, browser, model requests, database writes or deployment. Pending approval: focused existing tests and create/edit/remove/public/Aura round trip. Broader subspace landing-page redesign remains separate from this pricing/detail-fields change.

### Content-first subspace public layout — approved 2026-11-14

- [x] Reuse one static-page detail projection for public endpoint and owner Studio summary; public/direct approved entities only, including booking links, event schedule and venue. Do not expose private setup fields in preview.
- [x] Add one subspace identity renderer inside existing AuraIntro identity section, preserving other sections, editing, chat/history and main Space layout. Type/title/short summary; complete artwork beside compact date/location/price/action panel; About read-more; existing custom details and type-relevant Aura prompts.
- [x] Remove poster-as-background treatment for subspaces, retain selected image-derived accent/background/theme controls through a restrained gradient. One primary booking/action; configured alternatives stay accessible. Mobile stacks content.
- [x] Verify TypeScript/build/backend imports and diff; ask before tests. No migrations, live model requests, user-data writes or deployment. Update completion evidence below.

Completed: `SubspaceLanding` replaces only the existing AuraIntro identity section for child Spaces. Type/title/summary, intrinsic-ratio artwork, compact date/time/location and canonical pricing/custom-detail panel, one primary configured action, secondary action links, and About read-more. Missing data produces no example values or empty cards. Existing AuraIntro sections/editor controls, prompts/composer, chat history, streaming and main Space rendering remain in place. Owner-configured prompts are carried into Studio; type-specific prompts fill only missing defaults.

Backend: moved the existing booking filter into `entities/presentation.py` and reused it from public API and Studio summary. Shared page projection applies approved public/direct entity and field rules, excluding private/Aura-only/on-request fields. Existing get_public_entities supplies Studio data; public endpoint reuses its already-loaded entities. Event schedule and referenced venue come only from eligible records. Subspaces may use configured booking/enquiry/external actions; main Space booking behavior retained. Existing `_public_booking_links` import alias remains compatible. No changes to entity visibility or saved user records.

Appearance: uploaded or selected artwork remains in the hero for subspaces; image-color gradients provide atmosphere without a full-page poster. Existing image background setting becomes Artwork tint in subspace Studio; light/dark, accents, typography and radii still use the shared resolver. Main Space backdrop behavior retained. Existing image sampler is reused for ambient artwork color while explicit saved action accents retain priority. Dedicated AI prompt now guides recommendations toward structured subspace heroes.

Files: public API, appearance summary/schema/service and existing appearance AI context/prompt; new `entities/presentation.py` and public `SubspaceLanding.tsx`; existing PublicSpaceExperience/AuraIntro, Studio preview/inspector/background picker, appearance/PublicSpace API types, DESIGN.md.

Verification: frontend production build plus subsequent TypeScript check; backend public/appearance API imports and whitespace check passed. No browser, tests, live model requests, database writes, migrations or deployment. Visual/mobile behavior and authenticated public/Studio round trip remain unverified. Focused existing tests await user approval.

### Appearance header nested public link — 2026-11-14

- Fixed AppearanceHeader's slug-only link to reuse existing useSpaceHierarchy/spaceBranch, matching Space dashboard and Identity editing. Both displayed URL and destination include all ancestor handles. Main Spaces retain their top-level path; child links wait for hierarchy instead of briefly showing a flat URL.
- File: `ui/src/yullo/screens/appearance/components/AppearanceHeader.tsx`. TypeScript and whitespace checks passed. No browser/tests/data writes/deployment; click-through remains unverified.

### Editable subspace presentation and shared actions — approved 2026-11-14

- [x] Make existing hero layout, content alignment and density control the shared subspace renderer; AI recommends the approved split default and users can override via current history/Save flow.
- [x] Reuse existing image picker/upload/storage for cover/alternate image selection; add optional hero visibility to existing JSON so None can actually hide the fallback cover. No new image store or table.
- [x] Fix and adopt existing YulloButton for Appearance action buttons and common form actions. Central token-based primary/outline/ghost/danger styles, #FFFC00 default primary and defined charcoal edge; replace competing local action paint rules. Preserve specialized radio/image selection controls and public page accent.
- [x] Check frontend build/type-check, backend imports and diff; no tests without approval, no database writes/model requests/deployment. Record remaining gaps.

Completed: default child presentation now selects the existing image_left/left alignment while main defaults stay unchanged. SubspaceLanding consumes hero layout (above/left/right), alignment and density rather than hardcoding them. Existing JSON accepts optional hero.visible; legacy configs remain supported. Uploaded-cover selection, hide/None, replace/select/upload and picker removal all update that same hero config with history/Save. Replacing an image preserves the chosen child layout. No duplicate asset store or migration. AI prompt/allowed values start from the standard structured preset and preserve unrequested visibility/layout choices.

Shared actions: adopted existing YulloButton instead of adding a new primitive. Styling now lives in tokens.css under data-variant/data-size; primary defaults to vivid #FFFC00 with charcoal edges, and shared outline/focus/loading/disabled/reduced-motion behavior. Converted Appearance toolbar, recommendation/command/chips, rebuild, image-picker footer, layout/section confirmations, inspector row actions and add-image action; common FormActions now reuses it across forms. Removed conflicting local Save/primary/cancel paint rules and unused SVG spinner styling. Specialized image/radio controls and public page booking links retain their semantics/presentation accent. Other pre-existing Yullo native action buttons have not been exhaustively migrated; use this component for future edits.

Files: existing appearance schema/defaults/public parser, appearance recommendation prompt/allowed values; hero frontend schema, SubspaceLanding/AuraIntro/PublicSpaceExperience, existing inspector/assets/picker wiring; YulloButton, tokens.css, FormActions and Appearance action consumers/CSS; DESIGN.md. No new dependencies or root artifacts.

Verification: TypeScript/production build, backend public/appearance API imports and diff whitespace checks passed. No tests, browser, live model calls, database writes or deployment. Interactive undo/redo/save, image hide/replace round trip and visual light/dark/accent QA remain unverified; existing focused tests await approval.

### Booking/map completion, readability and dynamic rebuild — 2026-11-14

- Existing quick-created event booking/schedule/venue records are private by default; no stored visibility changed. Reused BookingLinks/BookingForm inside Studio inspector with a compact layout, existing visitor-enabled toggle and shared YulloButton actions. Booking saves invalidate the appearance summary so the preview can reflect newly public links. No duplicated booking service or inferred private links.
- Public/direct venue projection now supplies permitted coordinates and remote flag. Subspace details reuse the thin LocationMapPreview for physical locations, with existing lazy Google Maps loader and directions fallback when unavailable. Map token fallbacks adapt to presentation/interface themes. Online locations do not show map placeholders.
- Improved top alignment and image/details proportions; descriptions up to 1,200 characters remain expanded. Body text uses primary text tokens, custom-detail labels no longer use opacity, and supporting light/dark tokens have stronger contrast. Declared supporting-text pairs measured 7.17:1 (light canvas) and 11.11:1 (dark surface); actual rendered gradient/map pairs not browser-verified.
- Initial setup keeps the standard preset. Explicit AI Rebuild receives current unsaved config via existing endpoint, uses distinct rebuild prompt instructions to reconsider composition, and returns a reviewable candidate. Unchanged appearance candidates are rejected; provider failure leaves current layout intact with an actionable error instead of silently presenting a fixed fallback as a rebuild. Initial fallback remains available. Existing validation, same-Space asset selection, provider fallback and Save/history flows preserved. Stale cross-Space rebuild responses are ignored.
- Files: existing page projection/DTO/types, SubspaceLanding/SubspaceInfo/LocationMapPreview/themeTokens; BookingLinks/BookingForm/inspector; rebuild request/API/client/AppearanceScreen and existing appearance suggestion service/prompt. Removed an unused duplicate context read. No migrations or new dependencies.
- Verification: frontend TypeScript and production build, backend public/appearance imports and diff whitespace checks passed. No tests, browser, live model requests, user-data writes or deployment. Pending approval: existing focused tests and live AI/maps/booking-publication visual round trip.

### Production Google sign-in diagnosis and auth-only release preparation — 2026-11-14

- Read-only deployed bundle/OpenAPI inspection confirmed production main c13f43cde66ebb9c015ca7bd05dc16ab15d074ca still ships a demo Google handler submitting hardcoded profile fields (not a Google token). Production provider endpoint returns 404. Current verified Google SDK/id_token flow exists only locally. No sign-in or account-creation request was made during diagnosis.
- Production frontend points at api.support247.chat while Yullo uses host-only SameSite=Lax cookies; this cross-site configuration can cause session loss after navigation. Existing Vercel /api proxy already targets that backend. Yullo production JSON transport now uses this same-origin proxy, and local Aura transport shares that origin; Support247 transport/environment remains unchanged. Dev overrides retained.
- Redirect now uses a cleaned-up mount timer independent of animation completion. Google success confirms /auth/me before updating UI/navigating and shows a readable cookie/session failure for 401. Backend verifies real Google ID tokens using existing provider/client utility; no demo fallback. This switches production's old yellow demo control to the existing real Google-rendered control when released; other auth styling stays unchanged.
- GitHub secret names show no GOOGLE_CLIENT_ID/YULLO_GOOGLE_CLIENT_ID configured; local Settings has an existing client. Prepared optional workflow passthrough for those secret names without writing secret values. Google Web client must permit https://yullo.co (and www if used); console configuration not verified.
- Prepared a nine-file auth-only patch against production main under `/tmp/yullo-google-auth-release/auth-only.patch`, with base SHA and changed-file manifest beside it. This excludes unrelated local subspace/AI changes. Patch dry-run against fetched production files and targeted backend compilation passed; google-auth already present in production requirements. Current frontend production build, backend auth imports and whitespace checks passed.
- No tests, browser, real Google login, secret writes, commit, push or deployment performed. Await explicit approval to configure the existing Google client in GitHub Secrets and deploy the auth-only change. Production remains unchanged; OAuth-origin eligibility and end-to-end sign-in must be verified after deployment.

- Booking visibility follow-up: read-only local inspection of all-out-on-mic-8c47881b found live Space, one active owner_confirmed booking with URL but is_public=False, and one private extracted candidate. Public projection returns zero booking buttons. Owner must enable the confirmed booking for visitors using the existing editor; no visibility/data write performed. Publishing the Space does not automatically publish private entities.

### Owner Studio preview of private bookings — 2026-11-14

- User clarified that a saved booking must appear in owner Studio even when private. This supersedes the earlier policy of making owner preview strictly identical to public booking visibility.
- Added previewBookingLinks only to authenticated/owner-checked AppearanceSpaceSummary. Reads same-Space active, approved owner/source-authoritative actions; unreviewed extracted candidates remain excluded. HTTPS/label normalization is shared with the unchanged public projection rather than duplicated.
- Existing SectionEditorContext carries owner-only metadata into SubspaceLanding. Studio merges saved links with public actions, deduplicates IDs, and marks private links as Studio preview only with instructions to enable visitor visibility. Public Space type/API/model context does not receive this metadata; public page still renders only public/direct links. No visibility writes or automatic publication.
- Files: existing entity presentation helper, appearance summary/schema/service, frontend appearance API type/SectionEditorContext/AppearanceScreen/SubspaceLanding and DESIGN.md. No new table/endpoint/provider or migration.
- Verification: frontend TypeScript/production build, backend public/appearance imports and whitespace checks passed. No tests, browser, model calls, database writes or deployment. Owner preview/public isolation and rendered label remain unverified in a browser; existing focused tests await approval.

### Compact subspace booking action — 2026-11-15

- Replaced the full-width booking strip with an intrinsic-width, 44px minimum-height action, compact radius/padding and stable icon. Grouped it at the bottom of the details panel with a separator only when metadata exists. Shortened the owner-only visibility note; configured label, URL, theme accent and visibility boundaries unchanged.
- File: `ui/src/yullo/screens/public/components/SubspaceLanding.tsx`, shared by Studio/public renderer. TypeScript and whitespace checks passed. No tests, browser or deployment; rendered result remains unverified.

### Full code push authorization and validation — 2026-11-15

- User explicitly requested pushing all pending code. Scope includes the accumulated tracked/untracked feature code, migrations, configuration and documentation. Main push triggers existing GitHub CI/VPS deployment and git-linked Vercel deployment; no manual production data/secret changes authorized or performed.
- Pre-push checks: frontend production build passed; full app.main import passed (51 routes); Alembic has a single head e2f3a4b5c6d7; diff whitespace passed. New six-migration chain remains intact. Existing credential-shaped value in tracked .env.example was cleared without modifying runtime .env. Ignored private environment files and temporary auth-release artifacts remain excluded.
- Fetched remote main: two earlier production commits (landing routing and yellow auth styling) must be preserved while integrating all local changes. No force push. Deployment checks, migration application and live behavior must be assessed separately from successful push.
- Production Google client configuration remains pending: GOOGLE_CLIENT_ID/YULLO_GOOGLE_CLIENT_ID are absent in GitHub Secrets. The new real sign-in flow will show an unavailable/provider fallback until configured. User's push request does not itself supply secret values or verify Google Cloud allowed origins.

- Push completed as e290e2dbe85c647886fd0c24c72ede55cd9d685a after rebasing onto remote main and resolving YulloAuth while retaining new layout/auth styling. Remote and local main matched; worktree was clean.
- Failed-workflow investigation: run 43628624876 failed backend unit tests (18 failed/372 passed) and frontend tests (4 failed/142 passed); API import, isolated migrations, frontend type-check and lint step passed. VPS deploy job was skipped. Vercel commit status separately reports successful deployment, so frontend/backend releases are currently out of sync.
- Frontend failures: three IdentityForm website tests lack QueryClientProvider after hierarchy hook introduction; interrupted-chat retry test still expects four sendMessage arguments, while current transport passes abort signal/account arguments too.
- Backend failures group into stale schema-message expectations, incomplete AsyncMock/namespace fixtures for settings/parent/disclosure/children checks, direct endpoint tests missing newly injected user/session dependencies, and one streaming completion/persistence assertion. Appearance settings query returns a dict in production; old fixtures return a namespace or unconfigured AsyncMock. Booking tests omit disclosure_mode; profile fixtures omit parent_space_id. Do not weaken authorization/review guards merely to satisfy old fixtures. Streaming persistence failure needs deeper verification before classifying it as fixture-only.
- Investigation only: no tests run, application changes, new commit, retry or deployment performed. Next: update existing test harnesses/contracts and investigate streaming failure, run isolated focused checks with approval, then rerun CI and verify backend deployment. Google client secret setup remains separately pending.

### CI regression fixes — authorized 2026-11-15

- Updated existing test fixtures/assertions to current contracts: dict-valued appearance settings queries vs ORM config records; hierarchy owner/child lookups; parent/disclosure metadata; explicit guest endpoint dependencies and runtime session arguments; QueryClientProvider in Identity form tests; chat abort/account parameters; expanded grounding-reference validation message. No assertions bypassed, tests skipped or application authorization/review behavior relaxed.
- Streaming persistence failure was an outdated DB mock: it supplied execute() data while canonical session authorization now reads scalar(). Added a valid legacy guest session fixture with explicit ownership/proof fields. Complete/incomplete response and two-commit/native-history publication assertions remain intact and pass.
- Location list test now stubs its external Maps child, avoiding an environment-dependent missing IntersectionObserver when a local Maps key is configured. This test continues to verify branch names, visibility and editing selection; no new test cases or live provider calls.
- Verification: focused 67 backend/9 frontend tests passed; full backend suite 390 passed; full frontend suite 146 passed across 31 files; TypeScript and print hygiene passed. All migrations applied successfully to a newly created local CI-only PostgreSQL database, then that database was removed. Application data unchanged. Pending: push this fix and confirm remote CI/deployment results. Google OAuth secret/origin setup remains separate.

### Upcoming events in main Space appearance — implemented 2026-11-15

- Approved scope: next three future published direct event subspaces below the main introduction, before Aura. Responsive cover/title/date/time/public-location cards open the nested event page. No events means no section. Subspace pages do not render this section.
- Reused `services/spaces/hierarchy.py:list_public_child_events` and its owner/product/lifecycle/entity/field disclosure checks. A main-page helper selects three upcoming records and supplies nested URLs; Studio and public API use the same typed projection. No copying event data, private sources or booking records into parent knowledge.
- Exact top-three selection scans all published direct children rather than using the tool's capped candidate subset. The existing Aura tool retains its configured candidate cap. This retains the existing per-child entity loading approach; a large event catalogue should receive batched entity loading/query-plan profiling before broad rollout.
- Added `upcoming_events` to appearance sections. Existing configs acquire the new section immediately after identity on read, without a database migration. Explicit visibility/order is retained. Existing emphasis ordering is preserved for other sections; the events section uses its configured position. Existing inspector show/hide/up/down controls are reused; AI layout suggestions recognize the new section but do not invent event cards.
- Changed backend: `app/yullo/schemas/appearance.py`, `services/spaces/hierarchy.py`, `services/persistence/appearance.py`, `api/public.py`, and `app/orchestra/ai/appearance_preview/generate_appearance_suggestions.py`.
- Changed frontend: `api/appearance.ts`, `services/aura/types.ts`, appearance `presentation/schema.ts`, `presentation/presentationResolver.ts`, `components/PublicLinkPreview.tsx`, `components/inspector/AppearanceInspector.tsx`, public `components/AuraIntro.tsx`, and new `components/UpcomingEvents.tsx`.
- Existing endpoints extended: owner GET `/api/v1/yullo/spaces/{space_id}/appearance` and public Space GET projections (including nested path resolver) return `upcomingEvents`. Existing appearance save handles the section visibility/order; no new endpoint/table.
- Verification: TypeScript check, frontend production build, Python AST/schema compatibility checks and diff whitespace passed. User explicitly selected static checks only: no test suite, browser or database integration run. Rendered visual/interaction and real-data behavior remain unverified. No commit/push/deployment performed for this feature.

### Beacon — proposal only, not implementation authorization (2026-11-15)

Purpose and scope:
- Optional geographic discoverability for a published subspace of any type, separate from publication and its public URL. Reach options: 5 km, 10 km, City, Country, Worldwide. Worldwide grants discovery eligibility, never a promise to message every user.
- First release extends existing Home Nearby discovery. Notifications, paid promotion, map clustering and impression analytics are later phases, not implicit requirements.
- Preserve ordinary Nearby behavior: Beacon candidates are an additional source; absence of a Beacon must not remove existing organic Space/event results. Deduplicate an event appearing from both sources and show a Beacon/reach label without claiming delivery counts.

Owner flow:
1. Subspace header has a Radio icon with `Beacon` tooltip, beside existing actions. Open the standard side drawer.
2. Choose reach. Nearby requires an explicit origin (event's own public venue or separately selected area); online posts/events may choose any target city/country or worldwide without a street address. Never inherit a company's address silently.
3. Choose expiry with existing date/time controls; show the time zone. Event end caps expiry if supplied; otherwise default to the event start, or a configured duration for undated/non-event items. Owner may shorten expiry.
4. Preview the canonical public card and reach summary, then Activate. Existing Beacon shows Update and Pause. Changes are hard saves; close does not activate anything.
5. Display active/paused/expired status. Expiry is determined on reads, so worker downtime cannot keep a Beacon visible. Unpublishing/archiving/removing the subspace from its hierarchy immediately makes it ineligible; restoring publication requires explicit owner reactivation.

Data design — proposed new isolated table, existing Space/entity schema unchanged:
- `yullo_space_beacons`: `space_id` primary key/FK to `yullo_spaces.space_id` (one per subspace, delete cascade), `state` (active/paused), `reach` enum, `origin_location_entity_id` optional same-Space reference, `target_area` validated JSON (coordinates, city/region identifiers, ISO country), `starts_at`, `expires_at`, `revision`, created/updated timestamps.
- Store targeting/configuration only; title, cover, description, pricing, venue and booking remain canonical Space/entity data. Do not duplicate them in Beacon rows. Saved target area is an explicit owner choice; edits to a venue must flag it for review rather than silently move a campaign.
- Validate same-Space location references, Yullo product/owner/subspace/live lifecycle, coordinate pairs/ranges, radius choice, country code and timezone-aware expiry. Concurrency uses expected revision; initial create handles duplicate submits transactionally via unique Space key. Reject stale changes with 409.
- For local/private targeting, do not expose the exact targeting coordinates or private address in the discovery response. Resolve display metadata independently through existing public/direct field projection.
- Migration: inspect current and applied Alembic head before adding one new revision in `alembic/versions/`; checks for enums/revision/expiry and indexes on reach/state/expiry/country/city. No existing applied migration rewrite. Country/city matching needs normalized IDs; text-only city names are ambiguous. 5/10 km can reuse Haversine initially with a bounding-box SQL prefilter; assess PostGIS only if measured scale warrants it.

Matching and eligibility:
- Nearby radius: viewer-selected/consented origin is within the Beacon's 5/10 km target circle. Missing coordinates cannot match radius; offer manual city/country selection.
- City: normalized city + country (and region where needed); Country: ISO country; Worldwide: no location required.
- Always filter active interval, current published Space and ancestors, current hierarchy, matching owner/product and canonical direct/public content BEFORE returning/ranking candidates. A paused/expired Beacon cannot appear from the Beacon source. Content may still appear organically under existing Nearby rules.
- Extend existing Nearby request scopes to country/worldwide and optional 5/10 radius selection, preserving current defaults. Do not treat every remote item as worldwide or every Beacon as nearby.
- Reuse existing distance utility, location consent and ranking. Merge sources using stable Space/event identity; distance and event time provide deterministic ordering. Add pagination before lifting current Nearby result limits. No cross-Space knowledge retrieval or Aura delegation.

Proposed backend files:
- NEW `app/yullo/models/space_beacon.py`: isolated SQLAlchemy model; register through existing model/bootstrap loading.
- NEW `app/yullo/schemas/beacon.py`: strict read/update DTOs, reach/target/expiry/revision validation.
- NEW `app/yullo/services/spaces/beacon.py`: canonical owner read/save/pause and public eligibility/matching helpers. All UI/background entry points call these helpers.
- NEW `app/yullo/api/beacon.py`: GET `/api/v1/yullo/spaces/{space_id}/beacon`, PUT same path with expected revision, POST `.../beacon/pause` with expected revision. Private responses `Cache-Control: no-store`. Reuse `app/core/rate_limit.py` with separate Yullo activation buckets; verify required abuse-limit behavior rather than assuming the current fail-open limiter is sufficient.
- UPDATE `app/main.py`: router/model registration as required by existing loading pattern.
- UPDATE `app/yullo/services/home/nearby/repository.py`: select eligible Beacon candidates using database prefilters and current public projections; keep organic loading intact.
- UPDATE `app/yullo/services/home/nearby/ranking.py`: reach matching, merge/dedup and deterministic ordering using existing distance utility.
- UPDATE `app/yullo/services/home/nearby/service.py` and `app/yullo/schemas/nearby.py`: explicit radius/country/worldwide scopes and cursor contract; keep location observations out of URL logs.
- UPDATE `app/yullo/api/home.py` only if response/pagination wiring needs it; reuse existing read-only POST `/home/nearby`.
- UPDATE `app/yullo/services/persistence/identity.py` and `services/spaces/hierarchy.py`: pause Beacon in the same transaction when unpublished/archived/detached/moved. Public reads also enforce lifecycle to avoid reliance on hooks alone.
- REUSE `app/yullo/models/user_location.py`, `services/home/nearby/user_location.py`, `schemas/user_location.py`: consented/fresh browsing origin; no second location store or inferred precise location.
- NEW one migration under `alembic/versions/`; extend `app/yullo/config/inference.py` or a focused validated config module for feature flag, allowed/default expiry, activation limits and query limits. Do not store geographic/model/provider behavior in prompts.

Proposed frontend files:
- NEW `ui/src/yullo/api/beacon.ts`: typed owner query/update/pause hooks using existing Yullo client, account+Space query keys and invalidation.
- NEW `ui/src/yullo/forms/beacon/BeaconForm.tsx`: existing side-drawer pattern, segmented reach, existing date/time/location controls, preview and primary action. Reuse YulloButton, IconTooltip and shared fields; no second modal framework.
- UPDATE `ui/src/yullo/screens/SpaceDashboard.tsx`: subspace-only entry, status and drawer; do not clutter main Space creation.
- UPDATE `ui/src/yullo/api/nearby.ts` and `components/home/Nearby.tsx`: reach filters, Beacon badge, public card/nested URL and pagination while preserving organic results.
- REUSE `ui/src/yullo/home/useNearbyLocation.ts`: existing permission/manual-area flow; country/worldwide must not demand precise browser location.
- UPDATE this Home plan with approved scope, actual files/endpoints/migration revision, checks and remaining rollout work.

Phases and verification required before rollout:
1. Agree expiry defaults, whether worldwide is available to all accounts, and abuse/reporting rules. Suggested initial default: all reach options in discovery, one Beacon per subspace, no outbound alerts.
2. Implement table/schema/service and owner drawer; run approved focused checks for ownership, stale revision/duplicate activate, location ownership, expiry/pause and publication lifecycle. Applied migration checked separately from migration creation.
3. Add matching to Nearby with boundary checks at 5/10 km, ambiguous city names, country/worldwide, no location, online/physical, private fields, organic dedup, nested URLs, mobile/theme/keyboard and query performance. Use isolated test data only.
4. Feature-flag rollout; monitor query latency and safe error counts. No fabricated reach/impression statistics.
5. Optional notifications are a separate approval: add opt-in subscriptions, channel consent/preferences, per-user frequency caps, durable outbox/delivery dedup, retries/unsubscribe, and expiry/publication checks at send time. Existing ingestion Celery infrastructure may host a separate named queue only after inspecting its lifecycle; no new broker is necessary, but the ingestion queue must not be repurposed or blocked. Existing Home product events are not themselves a notification delivery system.

### Beacon implementation — approved 2026-11-15

Goal: ship the manual Beacon flow and a distinct Beacons subsection inside existing Nearby; AI, notifications, paid reach and analytics are excluded.
Architecture: one isolated row per Yullo subspace; canonical public content stays in Space/entities. Owner APIs use the existing Yullo authentication/CSRF client. Matching reuses NearbyArea and distance_km, with the existing organic list unchanged.
Execution: inline in this session. Preserve pending Upcoming events edits. Static checks only; no new tests, test suite runs, application database writes, push or deployment without further authorization.

- [x] Inspect schema head/applied revision and existing owner/form/nearby contracts; add the isolated model and new migration without rewriting existing revisions.
- [x] Implement strict reach/target/expiry DTOs, owner locking/revision saves and pause. Validate ancestors and same-owner/product; reuse direct public projection, never copy knowledge.
- [x] Add owner GET/PUT/pause endpoints with no-store and existing auth/CSRF/rate limits. Keep activation idempotent via row revision plus Space lock.
- [x] Add read-only Beacon candidates to Nearby as a separate response collection; validate lifecycle/expiry on each read, honor reach, dedup within Beacon results and preserve organic loading/ranking.
- [x] Add shared-control drawer with reach chips, selected target/map, public card preview, expiry, status, Activate/Update/Pause and safe loading/error/conflict states. Reuse DateTimeField, location picker, IconTooltip and YulloButton.
- [x] Wire subspace header entry and the existing Nearby subsection with country/worldwide browsing available without geolocation. Reuse location consent, avoid persistent precise coordinates in query keys, keep stale-account responses isolated.
- [x] Pause through existing lifecycle transactions on unpublish/archive/hierarchy change and enforce ancestor eligibility on discovery reads.
- [x] Run TypeScript/build/Python syntax/import/migration SQL checks only; inspect complete diff and update status/remaining migration/integration checks. Do not claim runtime verification.

Implementation choices: default expiry 7 days capped by configured event end (or start when no end); require future expiry within configurable 30-day maximum. City matching uses case-normalized city + region + ISO country (manual input supported); disclose no exact targeting coordinates. One owner-selected area per Beacon; no company-location inheritance. Worldwide is discoverable to all Nearby viewers, with a manual country/city option for other reaches.

Beacon completion notes — 2026-11-15:
- Implemented the manual flow only. New `app/yullo/models/space_beacon.py`, `schemas/beacon.py`, `config/beacon.py`, `services/spaces/beacon.py`, `api/beacon.py`, and `services/home/nearby/beacons.py`; registered the router/model through existing loaders. Public card DTO lives in existing `schemas/nearby.py` to avoid a circular schema dependency.
- GET/PUT `/api/v1/yullo/spaces/{space_id}/beacon` and POST `.../beacon/pause` enforce authenticated Yullo subspace ownership, no-store, owner locking, expected revision, current publication/ancestor eligibility, same-Space reviewed physical origin and future bounded expiry. Existing CSRF transport/rate limiter reused. The Redis limiter retains its existing fail-open infrastructure behavior; one row per Space and server validation remain enforced independently.
- New migration `f3a4b5c6d7e8` follows `e2f3a4b5c6d7`. Local applied revision was read as `e2f3a4b5c6d7` before changes. New table has Space-extension cascade FK, optional origin entity FK with SET NULL, state/reach/revision checks and expiry index. No existing table columns or applied migration were changed. Migration SQL generated successfully offline; this migration has NOT been applied by this task.
- Radius uses existing great-circle distance, with a latitude SQL prefilter. City compares normalized city + country and region when specified; country compares ISO code; worldwide needs no location. Uses existing fresh/consented location or an explicit manual area, never guessed IP geography. City/country viewers with only GPS coordinates must select an area; no new reverse-geocoding provider is introduced.
- POST `/home/nearby` adds `beacons`, `beacons_available` and an optional `beacon_scope` filter, retaining the original organic `items` contract and ranking. Beacon reads use a savepoint and visible error status so an optional-feature/migration failure does not take down organic discovery. Public cards project canonical direct/public event/location fields and nested URL, never private targeting coordinates, exact target distance, source bodies or conversations. Ancestor cache is request-local and owner-keyed.
- New `ui/src/yullo/api/beacon.ts`, `forms/beacon/BeaconForm.tsx`, `forms/core/AreaField.tsx`, `components/home/Beacons.tsx`; updated dashboard header and existing Nearby component/API. Reused YulloButton, IconTooltip, DateTimeField (optional labels/helper text preserve existing defaults), GoogleLocationPicker/LocationSearchField, existing entity records and location provider. Drawer includes reach chips, target map/manual fallback, own-page location selection, expiry, preview, status, Activate/Update/Pause, conflict reload and disabled-state guidance. Theme variables and reduced-motion handling retained.
- Owner Beacon query/mutations and Nearby replies guard against stale account responses; query/manual form state is account-scoped. Viewer cards expire automatically and Nearby refreshes each minute. Existing organic items remain in the API; UI removes only duplicate Space/canonical-title cards already shown in Beacons, retaining distinct event items from the same Space.
- Unpublish/archive/hierarchy changes pause Beacon rows within the existing lifecycle transaction, including descendants. Unpublish now shares the existing owner hierarchy lock to prevent an activation/unpublication race. Republish does not reactivate paused rows. Missing optional table is handled without breaking existing lifecycle operations. Saved origin edits are flagged in the drawer; target coordinates are a fixed, explicit choice until the owner reselects and saves.
- Feature settings: `YULLO_BEACON_ENABLED` (true), `YULLO_BEACON_MAX_DAYS` (30), `YULLO_BEACON_DEFAULT_DAYS` (7), `YULLO_BEACON_MAX_RESULTS` (9), `YULLO_BEACON_ACTIVATION_LIMIT` (20/hour). Event expiry caps the duration to end time, or start when no end is configured. No AI prompts/tools, notifications, worker jobs, duplicated knowledge, paid promotion or invented reach statistics added.
- Static verification: frontend production build/TypeScript passed; changed Python AST/module imports and full app import passed; PostgreSQL table/JSON lookup/lifecycle CTE SQL compilation passed; offline migration SQL generation, print hygiene and diff whitespace passed. No test cases created, no test suite run, no browser/real-data flow verification, in line with the user's static-only preference.
- Pending before use: apply new migration through the approved deployment/local migration process; verify owner activate/update/pause, geographic boundaries, cross-owner/Space rejection, expiry and publication races against an isolated database and rendered light/dark/mobile UI when authorized. No commit, push or deployment performed.
- Scaling limit: result payload is capped at configured 9 cards and geographically prefiltered. Matching currently scans eligible candidate rows and loads their public projections using existing services. No cursor/pagination or large-catalogue query profiling was added; batch/profile this path before wide deployment. City names use normalized text plus region/country rather than a new global geographic-ID registry.

### Subspace type suggestions and custom labels — approved/implemented 2026-11-15

- Added one searchable Type field to subspace creation. Suggestions: Event, Post, Announcement, Service, Job, Project, Other, plus previously saved custom labels from the current account's existing hierarchy query. Selecting Other clears the field for a specific custom type; a non-empty type is required in the creation UI. Keyboard selection, custom Enter, Tab dismissal, focus, disabled controls and existing theme styling reuse CategoryCombobox rather than a second dropdown implementation.
- Extended CategoryCombobox with optional local suggestions/item label/autofocus. Subspace Type never calls the category suggestions API or writes custom names to the shared category store. Existing category lookup/default behavior remains available to category fields.
- Added optional `type_label` to create/quick-description/hierarchy contracts. Central backend resolver maps Event to event behavior; Post/Posting/Announcement to posting; other built-ins retain their existing routing; arbitrary custom names map to other. Whitespace is normalized and labels limited to 60 characters. Canonical classification remains the existing enum; no enum/table/migration changes for this feature.
- Stored one label at `YulloConfig.settings.identity.type_label`, separately from category, and reused one read helper in owner hierarchy/identity, public page, Studio summary and Beacon projection. Labels are not private-source content; published subspaces expose their chosen public classification label. Owner/product/Space boundaries remain enforced for writes and private hierarchy suggestions.
- Existing listing options now use the same searchable control with an explicit Save type action. Revision/owner locks retained; type changes update publication context through the existing finalizer. Actual parent/behavior changes pause Beacons as before; a label-only rename does not pause an active Beacon. Create retries reject a conflicting saved type label rather than losing it silently.
- Frontend page headings/listing badges/public subspace badge/Studio/Beacon cards use the display label, retaining canonical type checks for event scheduling. Description generation receives the label in its existing prompt context. Switching the creation form away from Event no longer submits stale hidden schedule/venue fields. Existing sources, extraction/review, booking and publishing pipelines remain intact.
- Backend files: `schemas/spaces.py`, `schemas/forms/identity.py`, `schemas/appearance.py`, `schemas/nearby.py`, `api/space_forms.py`, `api/public.py`, `services/persistence/identity.py`, `services/persistence/appearance.py`, `services/spaces/hierarchy.py`, `services/spaces/quick_context.py`, `services/home/nearby/beacons.py`.
- Frontend files: `forms/core/CategoryCombobox.tsx`, `forms/subspaces/Subspaces.tsx`, `forms/identity/IdentityForm.tsx`, `api/spaces.ts`, `api/forms.ts`, `api/beacon.ts`, `services/aura/types.ts`, `screens/SpaceDashboard.tsx`, `screens/public/components/SubspaceLanding.tsx`, `components/home/Beacons.tsx`.
- Static verification: frontend production build/TypeScript passed; changed Python syntax/module/full application imports and diff whitespace passed. No tests or browser checks run (user's static-only preference), no new tests created, no database writes, commit/push/deployment. Runtime creation/edit/reload/keyboard/mobile behavior remains unverified. Earlier Beacon migration f3a4b5c6d7e8 is still pending application; custom type labels themselves require no migration.

### Public source resources — approved/implemented 2026-11-15

- Added a per-source `Show as a public resource` checkbox in What Aura knows, with explicit whole-original disclosure copy. Independent of source learning enable/pause and extracted fact/entity review. PDFs/images/files/links open only on click; notes show only icon/title until clicked, then load into a readable text dialog. Nothing auto-expands or preloads note bodies.
- Added compact Resources section above Chat history in the existing chatbot sidebar. Existing chats, new-chat/account operations and focus containment remain. The note dialog portals inside the native sidebar dialog, preserving the top layer and presentation theme variables. Closing the sidebar clears the note; every note open/file/link GET revalidates access, with no-store responses. Resource list refreshes while open and closes a note if its resource is revoked/replaced.
- Sharing is bound to the selected `source_version`; replacement/reupload does not auto-share a new version. Owner updates require both source version and independent sharing revision, with owner/Space/source row locks. Source deletion cascades access settings. Share/unshare updates the existing publication context through the canonical finalizer, without indexing/approving/reprocessing source content.
- Found and avoided a revocation race: ingestion can rewrite source_metadata after a long-running job. Public sharing therefore uses a Yullo-only access-settings record, not an ingestion metadata flag. No source/file/content copy and no shared KnowledgeBaseItem columns changed. Source owner responses hydrate settings in one scoped query; a pending optional table does not break ordinary source listing.
- New model `app/yullo/models/source_resource.py` / table `yullo_source_resources`: one row keyed by canonical source ID, same-Space/source-KB composite FK with delete cascade, nullable shared_source_version and revision. New migration `f4b5c6d7e8f9` follows pending Beacon head `f3a4b5c6d7e8`. Local applied revision checked as e2f3a4b5c6d7 before creating this migration. SQL generated offline; migration NOT applied by this task.
- New service `app/yullo/services/sources/resources.py` handles access settings, scoped public listing and original source authorization. Public reads check live current Space and all same-owner/product live ancestors, active same-Space KB, current source version and explicit access setting. No parent/child resource aggregation. Existing branch helper moved unchanged from Beacon into `services/spaces/hierarchy.py` and reused by both features to avoid duplicate lifecycle checks.
- Owner PATCH `/api/v1/yullo/spaces/{space_id}/sources/{source_id}/public-resource` uses existing authenticated/CSRF infrastructure. Anonymous GET `/api/v1/yullo/public/spaces/{space_id}/resources` returns only id/title/kind/version-bound href; GET `.../resources/{source_id}?version=N` serves the specifically approved original. No raw blob keys, paths, source bodies, extracted facts or private sources are included in the listing.
- Files use existing blob materialization/streaming, validate the Space key prefix and disallow traversal; approved original must exist when sharing is enabled. Safe PDF/raster formats are signature-typed for inline viewing; unsupported/active file formats download as octet-stream. nosniff, sandbox and no-store headers applied. Links use validated HTTP(S) originals without embedded credentials; notes use original source text/blob, never the extracted preview as a surrogate original.
- Backend files: new source_resource model and migration; `schemas/knowledge.py`, `api/knowledge.py`, `api/public.py`, `schemas/yullo_onboarding.py`, `services/sources/service.py`, new resources service; shared live-branch helper relocation in hierarchy/Beacon services and model registration.
- Frontend files: new `api/resources.ts`, `components/PublicResourceToggle.tsx`, `screens/public/components/PublicResources.tsx`; source DTO, AuraKnowledgeScreen, ConversationSidebar, PublicHeader and PublicSpaceExperience wiring. Existing ingestion/source review behavior remains intact. Public resource requests do not use the owner/auth interceptors and are scoped by current Space; source updates remain owner-authorized.
- Static verification: frontend production build/TypeScript, changed Python syntax/resource routes/full application imports, offline migration SQL generation and diff whitespace passed. No test suite, new tests, browser or real-data access/revocation/race checks run (static-only preference). No database writes, commits, push or deployment performed. Before use: apply migration chain through f4b5c6d7e8f9 and verify upload/share/unshare/replacement/deletion, private/draft ancestors, Space isolation, native PDF/image viewing and sidebar focus/theme/mobile with authorized integration checks.

### Deployment repair/release — authorized 2026-11-15

- User requested fixing deployment. Latest pushed revision 8a96c444 had successful GitHub/Vercel deployments and live API/DB/Redis health; approved Upcoming events, Beacon, custom types and public resources were still local/unreleased. Release scope is these approved changes plus required deployment fixes, through existing CI/VPS/Vercel workflows.
- Deployment-required checks: 146 existing frontend tests passed. Disposable local PostgreSQL database upgraded from empty through f4b5c6d7e8f9 successfully, then 390 existing backend tests passed. One existing archive-test fixture needed a synchronous begin_nested factory returning an async context manager for the new Beacon savepoint; assertions and runtime authorization/lifecycle behavior unchanged. No new tests, skips or weakened checks. Disposable databases removed; application DB unchanged during preflight.
- Frontend production build/TypeScript, print hygiene, credential-pattern scan, diff whitespace, shell syntax, workflow/Compose YAML parsing and docker compose config validation passed. Remote main fetched and matched the local base; no force push required.
- Found production API lacked persistent mounts for source blobs/uploads/local Chroma index. Added host-backed directories under /var/lib/support247/api-data, api-uploads and api-chroma; explicit DATA_DIR/Chroma paths. New deploy/preserve-api-storage.sh stops the old API briefly only for the initial consistent copy, retains the old container/files, restores it if copying fails, refuses overwriting unexpected nonempty destinations and recognizes already-mounted deployments. The workflow switches to the new container immediately after copying and marks storage migration complete only after health succeeds. No data directories are deleted or emptied. On failed storage-copy stages, only the task-owned temporary staging directory is removed.
- Docker build context now excludes .data/uploads and additional environment files so local private files aren't baked into images. SSH command timeout increased to 20 minutes. PostgreSQL/Redis volumes and migration-before-restart order retained. No authentication secrets changed.
- Pending at commit time: push release, confirm remote CI, Vercel deployment, VPS migration/storage copy/restart and live API health/routes. Actual production migration and file-copy outcome must be reported from the deployment logs, separately from local checks.

Deployment outcome — 2026-11-15:
- Released commit 5b6826017c5219969d18b9e2cdebd08c9b82bcf4 to main without force push. GitHub run 43703214882 completed successfully: backend checks, frontend checks and VPS deployment all green; Vercel commit status also success.
- VPS logs confirm both migrations e2f3a4b5c6d7 -> f3a4b5c6d7e8 -> f4b5c6d7e8f9 were applied, original API files preserved before switching to durable host mounts, and API/database/Redis health passed after restart. The initial storage move caused a brief 502 during the deployment, then recovered.
- Direct https://api.support247.chat/api/v1/health and proxied https://yullo.co/api/v1/health both returned healthy with database and Redis connected. Live OpenAPI confirms Beacon owner, source-resource owner and public-resource listing routes are deployed. No authenticated/user-content smoke actions or live AI requests performed.
- This final outcome note is a local documentation update; the deployed code is 5b682601. No extra deployment was triggered merely to publish the completion log.

### Compact creation drawer with pinned action — implemented 2026-11-15

- User requested a shorter, serious creation form following their compact form reference, with Create event always visible. Kept the current side drawer and every field/capability. Moved Cancel/Create into a shrink-0 footer outside the only scrolling body, with theme surface/border and mobile safe-area padding; retained form submission/validation/loading guards and used the shared YulloButton primitive.
- Paired Type and Title at desktop drawer widths; narrow screens stack them. Reduced field gaps/header padding and overview starting size (3 rows / 88px), keeping resize and 4,000-character capacity. Removed repetitive type/AI-word-count helper copy without changing suggestion generation or custom type behavior.
- Added opt-in compact presentation to existing ImageField and GoogleLocationPicker; used only by the creation drawer. Compact image preview keeps artwork contained; regular image field defaults remain unchanged. Creation map height is 160px vs existing 260px; address selection/pin/geocoding remain available. Upload, URL image entry, schedules, AI tools, booking links, pricing and custom fields are retained.
- Files: ui/src/yullo/forms/subspaces/Subspaces.tsx, forms/core/ImageField.tsx, forms/GoogleLocationPicker.tsx. Shared creation layout applies consistently to Event/Post/Service/Other. No backend/schema/migration changes.
- Verification: TypeScript/frontend production build and diff whitespace checks passed. No tests/browser checks run, matching the user's existing static-only preference. Sticky behavior was verified structurally (footer is outside overflow body); rendered desktop/mobile/keyboard behavior remains unverified. No commit, push or deployment for this UI change.

### New event schedule default — implemented 2026-11-15

- New event creation pre-fills the local date and AM/PM time for now + 10 minutes, rounded up to a whole minute. Also initializes an untouched empty schedule when selecting Event through the Type dropdown. Uses the existing date-fns formatter and current DateTimeField/state; no second picker or backend behavior.
- Initializes per new drawer opening, not on render or an interval. Manual edits and explicit clearing are preserved; non-event forms retain empty schedules. Date rollover is handled by Date arithmetic and local formatting; existing save conversion to UTC remains.
- File: ui/src/yullo/forms/subspaces/Subspaces.tsx. Production frontend build/TypeScript and diff whitespace passed; no tests/browser checks run (existing static-only preference). Not committed, pushed or deployed.

### Hide Purpose for subspaces — approved/implemented 2026-11-15

- UI-only change: IdentityFormScreen passes an explicit isSubspace flag from the saved parent_space_id; IdentityForm omits only the Space Purpose section for subspaces. Main Space forms retain the existing section. No replacement Type section added.
- Required purpose value remains loaded from identity.purpose into form state and submitted as before. Schema validation, backend persistence, parent inheritance and all other form sections remain unchanged.
- Files: ui/src/yullo/forms/identity/IdentityForm.tsx and screens/identity/IdentityFormScreen.tsx. Frontend production build/TypeScript and diff whitespace checks passed. No tests/browser verification run (existing static-only preference). No commit/push/deployment. Prior pending compact-drawer/date-default edits preserved.

### Event presence uses event location — approved/implemented 2026-11-15

- Hidden Presence Type only for event subspaces; main Spaces and non-event subspaces retain their existing control/behavior. Event classification/link section uses appropriate copy and fills the available column. Existing hidden Purpose behavior remains intact.
- Identity read API now returns canonical space_type and derives event presence from its own linked, active, reviewed event/location entity; no parent-company inheritance. Canonical event identity takes priority, with unambiguous matching-title support for older records. Only legacy events without current venue records use their deterministic original saved form's explicit location_mode. An unspecified event is not assumed physical merely because is_remote is false; removed/inactive current links don't regain an old venue through the fallback.
- Event identity create/update no longer writes another presence value; the frontend omits the redundant field on event saves. Existing stored identity presence is left intact for compatibility but not used as the event's authority. No synchronization, backfill, new stored field, schema migration or deletion. Public event pages already derive their format from disclosure-safe event/location entities and remain unchanged; no private venue data added to public/Aura responses.
- Backend files: app/yullo/services/spaces/quick_context.py, services/persistence/identity.py, schemas/forms/identity.py. Frontend: api/forms.ts, forms/identity/IdentityForm.tsx, screens/identity/IdentityFormScreen.tsx. Previous pending UI/date-default edits preserved.
- Verification: frontend production build/TypeScript, changed Python syntax/module imports and diff whitespace passed. No tests/browser or live-data verification run (existing static-only preference). No commit/push/deployment.

### Local Beacon 503 and repeated requests — fixed 2026-11-15

- Reported localhost GET /spaces/de3f17eb-52dc-4a9c-a920-6b907f23cd41/beacon returned repeated 503s. Verified local DB localhost:5432/multiagent still at e2f3a4b5c6d7 with neither Beacon nor resource settings table. Production deployment migrations had not affected this separate local database.
- Applied the existing additive local migration chain e2f3a4b5c6d7 -> f3a4b5c6d7e8 -> f4b5c6d7e8f9. Both tables and applied head verified afterward. No source/Space/Beacon settings records edited and no production change.
- Read the reported Space via canonical read_beacon service after the upgrade: successful inactive response, no writes. HTTP browser/auth session path was not exercised; debug/Vite configuration points to backend 8001 using the same .env.
- Updated ui/src/yullo/api/beacon.ts: explicit BeaconState query type, no automatic retry or window-focus refetch, minute polling only after a successful response. Existing manual Try again and fresh-mount/reconnect recovery remain; owner/account isolation unchanged. This stops error polling without suppressing a real failure or bypassing authorization.
- Verification: local revision/table inspection and read-only canonical Beacon read passed; frontend production build/TypeScript and diff whitespace passed. No test suite or browser run. Existing pending UI/date/presence edits preserved; frontend retry change is local/uncommitted, not deployed.

### Compact Beacon targeting — approved/implemented 2026-11-15

- Replaced the default city/state/country input stack with one location search, a compact clickable/draggable map pin, and a read-only city/state/country summary from the existing Google geocoder. Manual AreaField is shown only when lookup fails or lacks required reach metadata. Same-Space reviewed physical locations can seed the pin; parent/company locations are not inherited.
- Reach choices are Nearby, City, Country and Worldwide. Nearby uses a 10–100 km slider and an accent-colored coverage circle that fits the map and reacts to theme changes. Worldwide omits location controls. Existing expiry, revision conflict recovery, pause and pinned activation footer remain. Stale map lookups are cancelled when a different search selection is made.
- Reused LocationSearchField, GoogleLocationPicker, AreaField, DateTimeField and YulloButton; no new SDK or parallel location service. Optional map radius/lookup callbacks preserve existing consumers. Frontend files: forms/beacon/BeaconForm.tsx, forms/GoogleLocationPicker.tsx, forms/googleLocationMaps.ts and api/beacon.ts.
- Canonical owner settings now support nearby + radius_km (10–100), validated server-side and persisted on the existing Beacon row. Nearby discovery uses each Beacon's saved radius for conservative SQL prefiltering and exact great-circle matching. Original organic Nearby results, publication checks, ownership/product boundaries, expiry and public disclosure rules remain unchanged; private targeting coordinates are not added to public cards. Legacy 5/10 km settings remain readable, and 5 km stays unchanged until the owner explicitly changes coverage.
- Backend files: config/beacon.py, schemas/beacon.py, schemas/nearby.py, models/space_beacon.py, services/spaces/beacon.py and services/home/nearby/beacons.py. Existing owner GET/PUT /spaces/{id}/beacon and Nearby endpoints extended, no new routes.
- Migration f5c6d7e8f9a0 follows f4b5c6d7e8f9: nullable radius_km and additive reach/radius constraints; no backfill or record edits. Applied to the local development database only after checking its applied revision. Production migration is pending. Downgrade refuses to silently discard configured coverage.
- Verification: frontend production build (including TypeScript), changed Python syntax/module imports and git diff --check passed. Existing bundle-size warning remains. Static checks only; no test suites or browser/map integration verification. No commit, push or deployment. Previous pending compact event/Purpose/presence/retry changes preserved.

### Beacon event-location suggestion — implemented 2026-11-15

- Removed the separate saved-location selector. The existing searchable Location field now places the current event venue first among saved suggestions, followed by other reviewed physical locations from this subspace, then Google suggestions. Selecting a saved suggestion uses its existing coordinates/address without a second Places lookup; users can search another address or drag the pin afterward.
- New Beacons prefill the event address rather than only city/state. Existing saved Beacon targets remain unchanged until edited. Only same-Space reviewed locations with coordinates are offered; no company-location inheritance or database writes added.
- Files: ui/src/yullo/forms/beacon/BeaconForm.tsx and forms/LocationSearchField.tsx. The shared field has an optional savedSuggestions prop; existing callers retain their behavior. Frontend production build/TypeScript and diff whitespace checks passed; no tests/browser checks. Not committed, pushed or deployed.

### Beacon city/country boundary highlight — implemented 2026-11-15

- Beacon search now requests city suggestions for Nearby/City and country suggestions for Country. Saved event-location suggestions, current selection and reach changes display city/state/country names (country only for Country) instead of street addresses. Same-Space event venue remains the first saved suggestion; matching saved display values are deduplicated. Underlying selected coordinates and server-side targeting are unchanged.
- Added focused forms/googleLocationBoundary.ts hook using the existing Google Maps loader/geocoder and actual LOCALITY/COUNTRY feature layers. Resolves the selected administrative place within the selected country, fits its viewport, fills/outlines only its place ID with the configured accent, updates colors with theme changes, and clears stale highlights on area/reach change or close. No bounding-box substitute, new provider, stored geometry or database/schema changes. Nearby retains the existing coverage circle.
- Google Cloud setup required: configure the deployed VITE_YULLO_GOOGLE_MAPS_MAP_ID as a vector map with LOCALITY and COUNTRY boundary layers enabled in its cloud map style. DEMO_MAP_ID or unavailable boundary coverage cannot provide fills; an inline notice explains unavailable highlighting while retaining the valid selection. Official reference: https://developers.google.com/maps/documentation/javascript/dds-boundaries/start . Cloud configuration was not modified or verified.
- Files: forms/beacon/BeaconForm.tsx, forms/LocationSearchField.tsx, forms/GoogleLocationPicker.tsx, forms/googleLocationMaps.ts and new forms/googleLocationBoundary.ts. Other form callers retain default address suggestions and no boundary behavior.
- Verification: frontend production build/TypeScript and git diff --check passed (existing bundle-size warning). Static checks only; browser/map integration and enabled-layer configuration remain unverified. No commit/push/deployment.

### Beacon default expiry — updated 2026-11-15

- New Beacon expiry defaults to now + 24 hours using the existing server-side default_days setting (changed from 7 to 1 in both validated configuration and environment fallback). Existing saved expiry dates and owner edits remain unchanged. Earlier event expiry/maximum duration still caps the initial value. Explicit YULLO_BEACON_DEFAULT_DAYS deployment overrides remain supported.
- File: app/yullo/config/beacon.py. Python syntax/module import and git diff --check passed. Static checks only; no tests/browser or database changes. Not deployed.

### Beacon signal motion and Worldwide map — implemented 2026-11-15

- Added three accent-colored rings expanding from a central Radio icon behind the Beacon summary. CSS uses only transform/opacity, decorative aria-hidden/pointer-events-none, stops within five seconds, and shows static rings for reduced-motion users. No perpetual motion or animation library added.
- Worldwide retains the same map instance, clears city/country highlighting and radius through existing props, hides the location pin, and fits full world bounds. Location search/manual targeting controls are hidden for this scope, while map navigation remains available. Clicking the map cannot change a Worldwide target; switching back restores the existing location/pin and appropriate coverage. Pending reverse-geocode responses are cancelled on scope changes and cannot leave activation blocked.
- Files: forms/beacon/BeaconForm.tsx, forms/GoogleLocationPicker.tsx, styles/tokens.css. Shared map gains an opt-in worldwide prop; other forms retain their behavior. No backend/database changes.
- Verification: frontend production build/TypeScript and diff whitespace checks passed (existing bundle-size warning). Static checks only; rendered animation/map navigation remain unverified. Not committed, pushed or deployed.

### Beacon eligibility notice — updated 2026-11-15

- Removed the requested publication/parent/event eligibility notice from BeaconForm.tsx. Feature-unavailable notice, disabled activation state and backend eligibility validation remain unchanged. Copy-only UI change; diff whitespace check passed. Not deployed.

### Beacon full initial 24-hour prefill — corrected 2026-11-15

- Removed event/maximum-expiry clamping from the default_expires_at response. With the existing one-day default, new forms now prefill both local date and time at now + 24 hours, even if the event cutoff is earlier. Saved expiries still load unchanged. Explicit default-days configuration remains supported.
- latest_expires_at, server-side save validation, publication checks and the UI latest-expiry hint/validation remain unchanged. If the event cutoff is sooner, the owner must select a permitted expiry before activation. This supersedes the prior note saying the initial value was capped.
- File: app/yullo/services/spaces/beacon.py. Python syntax/module imports and diff whitespace passed. Static checks only; no tests/browser/data writes/deployment.

### Green Beacon radar illustration — implemented 2026-11-15

- Upgraded the existing Beacon summary illustration to semantic green radar: rotating conic sweep, static range circles, signal blips, central Radio icon and expanding rings. Uses darker green in light themes and brighter green in dark themes; other controls keep the configured accent.
- Replays on the activation/update process/status transition; existing text remains the authority for actual active/paused state. Decorative, aria-hidden and non-interactive. CSS transform/opacity motion stops in under five seconds; reduced motion keeps a still radar with spaced rings. No new component/library or backend changes.
- Files: ui/src/yullo/forms/beacon/BeaconForm.tsx and styles/tokens.css. Production build/TypeScript and diff whitespace passed (existing bundle warning). Static checks only; rendered motion remains unverified. Not committed, pushed or deployed.

### Beacon radar visual refinement — implemented 2026-11-15

- Replaced the oversized background decoration with a compact, contained radar instrument beside the title: deep green display, fine concentric range rings, crosshair, bearing ticks, narrow rotating sweep and two echoes timed to the sweep position. Neutral summary surface, separate text/artwork columns and smaller retained cover thumbnail improve legibility without text overlap.
- Removed superseded ripple/icon CSS instead of layering another animation. SVG geometry remains fixed; CSS animates transform/opacity only. Two 2.4-second scans replay on process/status change, then rest. Reduced motion retains a still radar. Decorative echoes do not represent measured people/reach; saved status text remains authoritative.
- Files: forms/beacon/BeaconForm.tsx and styles/tokens.css. Frontend production build/TypeScript and diff whitespace passed; old radar selectors have no remaining references. Static checks only; visual rendering remains unverified. Not committed, pushed or deployed.

### Beacon radius placement — updated 2026-11-15

- Moved the existing Nearby radius control above Choose your area in BeaconForm.tsx. Slider state, map coverage and legacy radius behavior unchanged. Static TypeScript/whitespace checks only; not deployed.

### Clearer price currency selection — updated 2026-11-15

- Existing shared DetailFields already saved amount + ISO currency together in create and edit flows. Improved its currency dropdown to show localized full currency names with codes and widened it to half the pricing row (stacked on narrow screens). Preserves saved currencies outside the preset list. No second currency field, conversion logic, backend/schema or data changes.
- File: ui/src/yullo/forms/subspaces/DetailFields.tsx. Frontend production build/TypeScript and diff whitespace checks passed; static checks only. Not deployed.

### Location-based event currency default — implemented 2026-11-15

- Event creation retains the selected Google venue/map country's code in temporary form state and passes it to the shared pricing fields. Enabling pricing uses that country's currency; later country changes update the automatic default. Explicit currency selections and already-saved prices are never automatically overwritten. Price amount remains unchanged (no currency conversion).
- Reused the same currency field and persisted SubspaceFields payload; no duplicate stored location/currency, backend service or migration. Country is taken only from this form's selected physical location, not the parent company, browser locale or Beacon target. Clearing/retyping the location invalidates the country suggestion; online/unspecified locations keep the existing editable fallback. Unknown/multiple-current-currency countries are not guessed.
- Added config/currencies.ts with a compact country/currency mapping derived from official Unicode CLDR 49 currencyData as of 2026-11-15, retaining its Unicode v3 license. Current tender currencies populate the existing selector, including countries beyond its earlier nine presets. Source: https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/currencyData.json . No new dependency/runtime requests/geolocation prompt.
- Files: ui/src/yullo/forms/subspaces/Subspaces.tsx, forms/subspaces/DetailFields.tsx and config/currencies.ts. Frontend production build/TypeScript and diff whitespace passed (existing bundle-size warning). Static checks only; no tests/browser/data writes. Not committed, pushed or deployed.

### Landing mobile fixes and Explore apps — implemented 2026-11-15

- Kept the existing landing sections; placed the sticky header in document flow, narrowed mobile branding/CTA, made claim buttons visible through scoped public accent variables, added anchor offsets, keyboard focus/skip link and reduced-motion handling. Reused the existing PNG with verified alpha transparency for logos. Headline: “Let people connect with what makes you, you.”
- All claim CTAs now enter Yullo auth. Replaced fabricated handle availability with the real API, loading/error feedback, stale-response protection and a sign-in continuation. Public handle validation now follows the canonical 3–50 character format and returns 503 on database failure instead of falsely claiming availability. A selected handle is carried into the existing creation screen and retained when entering a name. After claim sign-in, existing drafts resume in their identity editor; only a confirmed absence of a draft enters the existing new-Space flow. Normal sign-in/chat-return flows remain unchanged.
- Added `/yullo/explore`: responsive app icon grid with debounced name/@handle search, URL query persistence, keyboard navigation, pagination, missing-image fallback and loading/empty/error/retry states. Icons open the canonical public Space chatbot URLs, including nested paths. User confirmed this launcher interpretation. No fake app entries or separate knowledge/search index.
- Added GET `/api/v1/yullo/public/directory` with bounded, validated search/cursor/limit and an explicit minimal response schema. Reads existing Yullo identities only; requires active/live Space and Yullo lifecycle plus canonical live same-owner ancestors. No private sources, conversations, inferred content or credentials are searched or returned. Request-local ancestor cache and no-store responses; no database migration or durable data writes.
- Added Yullo-owned About, Manifesto, Contact, Privacy and Terms pages under `/yullo/*`; contact uses user-confirmed `hello@yullo.co`. Footer and auth legal links use these routes. Existing `/about`, `/what-we-do`, `/contact`, `/privacy` and `/terms` aliases select Yullo content on Yullo hosts; Support247 host behavior stays intact. Removed generic social-network homepage placeholders. Scoped styles use `.yullo-marketing` to avoid changing the existing public-chat `.yullo-public` renderer. Central SEO handles the new pages/headline; favicon remains owned by RouteSeo.
- Backend files: `app/yullo/api/public.py`, new `schemas/directory.py`, new `services/spaces/directory.py`, `app/api/v1/yullo_auth.py`.
- Frontend files: `ui/src/App.tsx`, `lib/RouteSeo.tsx`; Yullo `config/index.ts`, new `config/publicPages.ts`, new `api/directory.ts`, new `styles/public.css`, new `components/YulloPublicLayout.tsx`; existing Header/Hero/Footer/ClaimHandle/FinalCTA, `components/auth/AuthPanel.tsx`; Landing/Auth/NewSpace screens, new Explore/Info screens.
- Verification: production frontend build and TypeScript passed; focused ESLint and git whitespace checks passed. Python syntax and API/schema imports passed (shell DEBUG=release needed a command-local DEBUG=false override). Read-only local API requests verified 200/no-store/minimal fields, page bounds/disjoint cursors, @handle search, empty search, one canonical public chatbot target, and invalid-handle rejection. No credentials, source bodies or returned Space identities were logged in the task output.
- Pending: actual narrow-screen/keyboard visual review and authenticated end-to-end claim flow; browser host was unavailable and native Chrome access was not approved. User explicitly chose to skip existing public-chat regression tests on 2026-11-15; no tests were added or run. No production verification, commit, push or deployment. Pre-existing Beacon/location/currency edits and migration were preserved.

### Landing button color — updated 2026-11-15

- Main landing CTAs (header claim, hero claim/Explore apps, handle check/claim and final claim/Explore apps) now use Snapchat yellow `#FFFC00` with black text/icons and a 1px black border. Shared scoped `.yullo-cta` styling keeps existing sizes, routing and interactions. Other surfaces retain their palette.
- Files: `ui/src/yullo/styles/public.css` and `components/YulloHeader.tsx`, `YulloHero.tsx`, `YulloClaimHandle.tsx`, `YulloFinalCTA.tsx`.
- Production frontend build/TypeScript and diff whitespace checks passed; existing bundle-size warning remains. Tests skipped per user instruction; visual browser review remains unverified. Not committed, pushed or deployed.

### Auth back navigation — implemented 2026-11-15

- The auth screen previously displayed a back link only for chat-return sign-ins. Added a visible Back to Yullo link above the auth controls on mobile and desktop, using Snapchat yellow, black border and a left arrow. It returns to `/yullo` locally or `/` on Yullo hosts. Existing validated Back to chat destination remains intact for chat-return sign-ins. Auth and claim actions are unchanged.
- File: `ui/src/yullo/screens/YulloAuth.tsx`. TypeScript, focused ESLint and diff whitespace checks passed. Tests remain skipped per user instruction; rendered browser behavior unverified. Not deployed.

### Lighter auth background — updated 2026-11-15

- Lightened the desktop brand panel and mobile brand strip from `#F8FAFD` to near-white `#FDFEFF`; reduced the decorative network canvas to 25% opacity for clearer text. Keeps the network animation, logo, auth controls and routing intact.
- Files: `ui/src/yullo/components/auth/AuthBrandPanel.tsx`, `AuthBrandNetwork.tsx`, `screens/YulloAuth.tsx`. Production build/TypeScript and diff whitespace checks passed (existing bundle-size warning). Tests remain skipped; visual browser review unverified. Not deployed.

### Landing background clarity from screenshot — fixed 2026-11-15

- Screenshot identifies the landing How it works section, rather than auth. The visible purple gradient matches the shared dark body background. The shared root is a viewport-height flex column; added scoped `flex-shrink: 0`, an explicit opaque `#F9FBFF` background/text color and stacking isolation to `.yullo-marketing` so its light surface extends with its full content. Shared Support247/dashboard theme settings remain untouched.
- Faded the landing canvas network from 90% to 25% opacity and changed the “And then you waited.” heading line from slate-400 to slate-600. Network animation and section interactions remain intact.
- Files: `ui/src/yullo/styles/public.css`, `components/YulloCanvasNetwork.tsx`, `components/YulloOldVsNew.tsx`. Production build/TypeScript and diff whitespace checks passed (existing bundle-size warning). Tests skipped per prior instruction. Browser rendering remains unverified; no deployment.

### Landing network visibility — adjusted 2026-11-15

- Kept the full-page light background and darker heading. Restored the network canvas to 75% opacity, deepened its cyan/blue/violet/gold colors for light surfaces, strengthened line opacity/width and node opacity, and raised the quiet scroll phase from 0.12 to 0.45 so the graph stays visible behind the text. Preserved hover responses, pulses, scroll phases, counts and reduced-motion handling.
- File: `ui/src/yullo/components/YulloCanvasNetwork.tsx`. Production build/TypeScript and diff whitespace checks passed (existing bundle-size warning). Tests remain skipped per user instruction; visual browser review remains unverified. Not deployed.

### Landing network motion — implemented 2026-11-15

- Added gentle node drift (4–11px, 14–23 second horizontal/18–23 second vertical cycles), 6-second radius breathing, staggered 3.6-second expanding rings on anchor nodes and 1.4–2 second traveling pulses with short trails along actual graph connections. Fine pointers attract nearby nodes slightly and retain hover highlights with approximately 160ms following; touch input does not trigger hover movement. Marketing purpose: explain a connected, active network while leaving reading space quiet. Existing light background, node colors/opacity, node counts and scroll-dependent visibility/finale convergence remain.
- Reused the existing canvas and requestAnimationFrame loop with elapsed-time movement rather than frame-dependent speeds. Bounded simultaneous pulses (2 mobile/4 desktop); pause while the document is hidden and resume without jumping. Rebase node anchors on resize and cap canvas pixel ratio at 2 for sharper lines. Reduced motion now retains a still graph, including live preference changes, instead of hiding the canvas. Cleanup removes frames and all listeners. No new library or React animation-state updates.
- File: `ui/src/yullo/components/YulloCanvasNetwork.tsx`. Production build/TypeScript, focused ESLint and diff whitespace checks passed (existing bundle-size warning). Tests remain skipped per user instruction. Browser playback, motion feel and real-device performance remain unverified; not deployed.

### Snapchat yellow and selected-card contrast — fixed 2026-11-15

- Screenshot identified the pale subtitle on the selected customer situation card. Selected titles/subtitles and indicator now use the dark accent foreground, with a black border; inactive subtitles and showcase labels use readable slate-600. Added aria-pressed to expose the existing selected state. Fixed similarly faint text/icons on other yellow Aura/How it works panels, while retaining light text inside their dark inset card.
- Changed the shared public accent and brand yellow to Snapchat `#FFFC00`, plus hardcoded yellow foreground accents in Hero, OldVsNew, AuraInteractive, Differentiator, NetworkGraph, UseCases, FinalCTA and PublicLayout. Yellow depth token now uses a pale version of the same yellow instead of orange/gold. Buttons, selected cards and primary illustration accents now agree. Decorative canvas colors/motion remain unchanged.
- Files: `ui/src/yullo/styles/public.css`, `config/index.ts` and the listed Yullo landing components. Production build/TypeScript, focused ESLint and diff whitespace checks passed (existing bundle-size warning); selected text/background contrast calculates to 16.21:1. No old `#FFDA2D`/`#F6B91A` values remain in the landing components or shared public palette. Tests remain skipped; new browser rendering unverified. Not deployed.

### Beacon entry button gradient/glow — implemented 2026-11-15

- Styled only the existing Beacon entry button with a green/mint-to-cyan gradient blended into the theme surface, a soft green halo and stronger active/hover glow. Dark themes use a lighter readable green icon; the existing tooltip, 44px target, active marker and configured-accent keyboard focus remain. No perpetual animation; hover transitions respect reduced motion and pointer capabilities.
- Files: forms/beacon/BeaconForm.tsx and styles/tokens.css. Static frontend TypeScript/whitespace checks passed; visual rendering unverified. No backend/data changes or deployment.

### Rainbow Beacon button refinement — implemented 2026-11-15

- Replaced the green/cyan treatment with a full-spectrum conic-gradient border and blurred rainbow halo. An opaque theme-surface face keeps the Radio icon readable, with a subtle configured-accent tint; active/hover increases halo visibility. Scoped pseudo-elements are non-interactive, no perpetual animation, reduced-motion respected. Existing tooltip, status dot, keyboard focus and 44px target retained.
- File: ui/src/yullo/styles/tokens.css. Frontend production build and diff whitespace passed; static checks only, visual rendering remains unverified. Not deployed.

### Deployment follow-up — 2026-11-15

- Pushed Beacon rainbow button changes as 94044e1a. Found prior main deployment a42655d8 blocked by test_get_identity_success: its unpersisted YulloSpace fixture omitted space_type, so SQLAlchemy's insert/server default had not run and the new IdentityFormResponse enum rejected None. Updated that existing fixture to explicit space_type="space" matching the database contract. No production behavior or test coverage removed; no new tests.
- Frontend production build and diff whitespace passed locally. Existing GitHub CI runs unit suites in its isolated CI database; no local test/database writes. Deployment workflow/commit statuses monitored after push.

### Production deployment verified — 2026-11-16 IST

- Application commits 94044e1a (rainbow Beacon button) and ed63e815 (existing identity fixture correction) pushed to main. GitHub workflow 43747072066 succeeded: backend tests/print hygiene, frontend checks/tests, VPS build/restart. Superseded run 43746981794 cancelled. Run: https://github.com/akhilsahu/support_triage/actions/runs/43747072066 .
- Vercel status succeeded for ed63e815; the public Yullo auth page returned 200 and its loaded CSS was verified to include the rainbow Beacon rules. Cloudflare Workers check also succeeded.
- VPS logs confirm migration f4b5c6d7e8f9 -> f5c6d7e8f9a0 applied and API/database/Redis healthy after restart. Both https://api.support247.chat/api/v1/health and https://yullo.co/api/v1/health returned 200/healthy afterward. No manual production data edits.
- Earlier pending Beacon/form/currency changes in a42655d8 are now included in this successful VPS deployment. Google Cloud boundary-layer enablement and interactive visual/map checks remain unverified; no browser used. This follow-up documentation records the verified application deployment and does not require another API restart.

### Explicit Explore discovery opt-in — implemented 2026-11-16

- Added Show in Explore apps checkbox to the existing identity edit form for both main Spaces and subspaces. Each page controls itself independently; no parent inheritance. Defaults off, including existing items with no saved flag. Generic page copy avoids implying changes to the parent. Frontend schema/reset/API payload preserve the value through the existing save flow.
- Reused yullo_configs.settings.identity.explore_discovery with strict boolean owner update validation, existing owner/product checks, row locks, expected_revision and canonical mutation finalization. Identity read defaults missing/non-boolean flags to false. No new table, migration, duplicated setting or new endpoint.
- Public directory query now joins the existing configuration and requires JSON boolean true before search/cursor/limit. Missing config, missing/null/false/string values are excluded. Existing live status, active product boundary and live same-owner ancestor checks remain. Parent discovery need not be enabled for an independently opted-in child, but the ancestor chain must remain publicly live. Current no-store API behavior retained.
- This intentionally removes existing published items from Explore until the owner enables the flag. Direct public links, organic Nearby, Beacon discovery, knowledge, tools and conversations remain unchanged. Updated public privacy copy to explain opt-in discovery.
- Backend: schemas/forms/identity.py, services/persistence/identity.py and services/spaces/directory.py. Frontend: api/forms.ts, forms/identity/IdentityForm.tsx, screens/identity/IdentityFormScreen.tsx and config/publicPages.ts. Existing GET/PUT /spaces/{id}/forms/identity and GET /public/directory extended.
- Verification: frontend production build/TypeScript, changed Python syntax/module imports, PostgreSQL filter compilation and git diff --check passed. Static checks only; no tests/browser/database writes or integration verification. Not committed, pushed or deployed.

### Header App discovery control — implemented 2026-11-16

- Added App discovery switch below the public link/status in the SpaceDashboard title area for both Spaces and subspaces, using the empty area alongside the cover. Includes concise helper text and a focusable info tooltip describing Explore eligibility, off-state behavior, direct public links and independent subspace settings.
- Saves immediately through the same identity update endpoint/flag/revision as the edit form; no duplicate setting or endpoint. Cache refresh keeps both views consistent and invalidates Explore results. Pending state prevents repeated or concurrent visibility writes, shows saving feedback, and failures show inline recovery text; revision conflicts refresh the saved identity before retry. No optimistic success state.
- Account ID is captured and checked before requests/response handling, and forwarded through the existing X-Yullo-Chat-Account contract using an optional formsApi.updateIdentity argument. Other callers remain compatible. Switch has semantic role/checked/label/description, 44px target, configured-accent state/focus and reduced-motion-aware thumb transition.
- Files: ui/src/yullo/screens/SpaceDashboard.tsx and api/forms.ts. Frontend production build/TypeScript and git diff --check passed (existing bundle-size warning). Static checks only; rendered/keyboard/network behavior unverified. Previous pending Explore backend/form changes preserved. Not committed, pushed or deployed.

### Rich subspace preview details — implemented 2026-11-16

- Added a labeled details section in the existing SubspaceLanding renderer with responsive date/start-time rows, configured end time, venue/link and compact map, pricing label, existing custom details and booking/action controls. AM/PM and displayed local timezone remain explicit. Missing values are omitted; no inferred dates, venue details, pricing, audience metrics or AI-generated facts. Existing artwork layout controls, theme/accent, long description and action sizing remain.
- Root cause: quick-form event/location records default private, while Studio passed only the public-safe projection. Extended the existing owner-authorized appearance entity query to include current-Space approved event/location records alongside actions. Added previewPageDetails only to the authenticated appearance summary, carried only through SectionEditorContext. Studio can display saved private details with per-field Private markers and a clear Studio-only notice. Public data takes priority; venue metadata is chosen as a unit to avoid mixing public addresses with private coordinates.
- Refactored date/linked-venue formatting into one _page_details projection used by public_page_details and owner_preview_page_details with separate eligibility inputs. Public entity, field-policy, review and disclosure filtering is preserved unchanged. Anonymous/public APIs and Aura model context never receive previewPageDetails; owner values do not enter PublicSpace or persisted generated layouts. No visibility flags, extraction/review pipeline, records or publication state are changed.
- Backend files: services/entities/presentation.py, services/persistence/appearance.py and schemas/appearance.py. Frontend: api/appearance.ts, screens/appearance/AppearanceScreen.tsx, screens/appearance/preview/SectionEditorContext.tsx and screens/public/components/SubspaceLanding.tsx. Reuses existing authenticated appearance endpoint, map and subspace-info components; no new routes/tables/migrations/dependencies.
- Verification: frontend production build/TypeScript, changed Python syntax/module imports and git diff --check passed (existing bundle-size warning). Static checks only; no tests/browser/database writes. Integration and visual behavior unverified. Pending Explore changes preserved. Not committed, pushed or deployed.

### Flexible Aura event queries — implemented, visibility decision pending 2026-11-16

- Extended the existing list_events tool/service, without another agent/tool pipeline: timeframe all/upcoming/past; relative window 24_hours/week/month/year; existing timezone-aware ISO start bounds for arbitrary ranges; sort_by date_asc/date_desc/created_desc. General event requests stay unfiltered. Relative windows/upcoming use the server clock; month/year use calendar arithmetic with end-of-month/leap-day clamping. Request conflicts are validated, and unrelated lookup failures remain unavailable rather than empty results.
- Filtered results include a separate bounded undated_events list so public pages with unavailable schedules can be mentioned without being classified as upcoming/past. Candidate/result limits and incomplete-result flags remain; scan_all accurately reports candidate truncation only when enabled. Sorting keeps undated items last. Canonical space-event identity wins over ambiguous extracted duplicates/title matching. Tool URLs use the verified full live parent path; existing Upcoming Events projection reuses that path rather than prepending it twice.
- Prompt now distinguishes current-event questions (current authorized evidence) from child-event listings, chooses appropriate window/timeframe/sort, respects timezone ambiguity/unknown schedules and avoids narrating internal filters. Same-Space scope binding, direct child/same-owner/product/live checks, public-only entity/field projection and candidate limits remain. Added live ancestor-path validation before returning listings.
- Read-only local diagnosis before implementation confirmed All out on MIC is live but its canonical owner-confirmed schedule is private, starts 2026-11-15T09:30:00Z, no end. Amazon India's unfiltered listing returns its public identity with starts_at=null; the event's own list_events returns only its children. No record/visibility changes were made. User asked whether schedules should become public with Live; async question remains pending. Do not publish/backfill private schedules without that answer.
- Files: app/yullo/services/spaces/hierarchy.py and app/orchestra/ai/prompts/yullo/composer.py. Python syntax/imports, existing Agno tool schema generation and diff whitespace passed. Static checks only; no test suites, model calls or integration/database writes. Existing pending Explore/preview changes preserved. Not committed, pushed or deployed.

### Event availability semantics clarified — implemented 2026-11-16

- User clarified that Live controls listing availability; passing the start time must not remove a booking-style event. All listings retain all Live child events. Upcoming booking queries include future/ongoing/started-with-unknown-end events and exclude only confirmed ended events. Past queries remain available for Live history and mean the start passed, without claiming the event finished unless its end confirms it. Return event_status so Aura distinguishes ended/ongoing/upcoming/started_end_unknown/schedule_unavailable.
- Added window=today and explicit IANA time_zone (UTC default disclosed to the model). Today covers midnight to next midnight, including earlier/later starts and known multi-day overlap, rather than starting at now. Calendar month/year windows respect the supplied timezone and preserve existing exact 24-hour duration behavior. End-of-day is exclusive; missing end is not assumed finished. Explicit non-today ranges continue matching starts.
- Reused the same listing service/tool/prompt and central timestamp parser; no auto-unpublish/background expiry, new table/tool/model/provider or data write. Current private schedules are still unavailable to the parent tool. User's reply clarified availability but did not explicitly request changing stored private flags; no visibility/source/review settings were changed.
- Files: app/yullo/services/spaces/hierarchy.py and app/orchestra/ai/prompts/yullo/composer.py. Python syntax/imports, Agno tool schema generation and diff whitespace passed; static checks only. No tests/model calls/database writes/browser/deployment. Pending Explore/preview work preserved.

### Event tool transaction failure — reproduced/corrected 2026-11-16

- Confirmed the exact failed reply was recorded for the local Amazon India/event scope, timestamp 2026-11-15T19:54:19Z. Direct canonical listing and actual bound tool invocation both succeeded in clean read-only local transactions. The original runtime exception was not retained in available logs; do not claim its exact cause is confirmed.
- Reproduced a concrete failure mode: an unrelated failed SELECT leaves the shared chat AsyncSession transaction aborted; calling the event tool then returned unavailable. A separate concurrent-read probe on a healthy session succeeded, so concurrency itself was not established as the cause.
- Event tool now opens an independent read-only AsyncSession using the request's same configured database bind, rather than sharing retrieval transaction state. No global alternate database/client, write/commit, retry loop, service bypass or visibility relaxation. Current Space scope remains bound outside model arguments, and existing same-owner/product/live/ancestor/public-disclosure checks run in the canonical listing service. Closes/rolls back the read session on every path.
- Error logs now include safe Space ID/error class in the formatted log message as well as structured extras, so handlers which drop extras still expose the failure class. No source contents, tool arguments, credentials or raw SQL errors are logged.
- Verification: Python syntax/imports and diff whitespace passed. Read-only local diagnostic before fix returned unavailable after an intentionally failed read; identical diagnostic after fix returned success, including one published event with schedule unavailable. No test suites, model calls, durable data writes or browser use. End-to-end live chat retry remains unverified; private schedule availability remains a separate unresolved issue. File: app/yullo/services/spaces/hierarchy.py. Previous pending work preserved. Not committed/pushed/deployed.

### Explore/preview/event-tool production release — verified 2026-11-16

- Application commit 940da681 pushed to main. Workflow 43835131425 succeeded: frontend checks/tests, backend API import/migrations/390 tests/print hygiene, VPS build and restart. Vercel and Cloudflare checks also succeeded. Run: https://github.com/akhilsahu/support_triage/actions/runs/43835131425 . No new migrations in this release.
- VPS logs confirm API/database/Redis healthy and Deploy complete. Post-restart direct API health returned 200/healthy. Initial Yullo proxy health probe timed out; retry returned healthy with database/Redis connected. Explore endpoint returned 200 with empty items/next_cursor=null, consistent with explicit opt-in defaults; frontend /yullo/auth returned 200.
- Includes pending Explore flags/header control, owner-only richer preview details, flexible event query windows/statuses/sorting and isolated read-only event-tool session. No private event/source visibility flags were changed, so parent date filtering still depends on public schedule visibility. A full AI chat reply and rendered UI were not exercised in production.
- Deployment complete; this documentation-only follow-up records verified application release results without another backend restart.

# Yullo Home Backend Integration Implementation Plan

> **For agentic workers:** Execute this plan task by task. Preserve the existing Yullo Home visual implementation and replace fixtures only when each backend field is grounded and owner-scoped.

**Goal:** Connect every supported Yullo Home section to authenticated backend data, close the current isolation and correctness gaps, and hide signals whose backend evidence does not yet exist.

**Architecture:** Extend the existing `GET /api/v1/yullo/home` read model instead of creating one endpoint per visual module. Current state comes from grouped queries over canonical tables; sanitized owner-visible activity comes from existing conversation events plus a small Yullo-only domain event table. Deterministic rules produce attention, recommendations, patterns, and Orbit signals; the Home read path never calls an LLM.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy async, PostgreSQL/JSONB, Alembic, React 18, TypeScript, TanStack Query, isolated Yullo session-cookie authentication.

**Specs:**

- `yullo/auraplans/ui-home-design.md`
- `yullo/auraplans/2026-09-19-yullo-home-page-design-implementation.md`
- `yullo/auraplans/2026-09-18-aura-backend-implementation.md`

## Decomposed execution plans

This document remains the parent contract. Implement the focused plans below in order; they explain exactly how data enters each table and how Home derives each section:

1. `yullo/auraplans/home/README.md` — architecture, ownership, order, and full data-lineage matrix.
2. `yullo/auraplans/home/01-home-events-plan.md` — event producers, transaction rules, redaction, deduplication, and the `yullo_home_events` table.
3. `yullo/auraplans/home/02-current-state-plan.md` — grouped reads from Spaces, sessions, sources, jobs, facts, Space entities, and preferences.
4. `yullo/auraplans/home/03-intelligence-signals-plan.md` — deterministic For you, Quick insight, Pattern, attention, and suggestion generation.
5. `yullo/auraplans/home/04-orbit-plan.md` — Pulse/Momentum providers and future Nearby/Connection providers.
6. `yullo/auraplans/home/05-api-frontend-integration-plan.md` — response contract, typed actions, frontend adapter, section collapse, and fixture removal.
7. `yullo/auraplans/home/06-section-preferences-plan.md` — authenticated section visibility/order persistence.

Do not create an `intelligence_items` table in the first release. Intelligence items are short-lived, evidence-backed read models derived from canonical state and append-only events. Persist them later only if dismissal history, scheduled delivery, or expensive offline computation proves that storage is required.

## Reusability contract

| Concern | Reuse | Yullo-owned boundary |
|---|---|---|
| Identity/tenancy | `users`, `spaces` | `yullo_spaces` lifecycle/publication extension |
| Knowledge | `knowledge_bases`, `knowledge_base_items`, vector backend, `kb_facts` | Aura assignments, typed Space entities/evidence and publication policy |
| Ingestion | `ingestion_jobs`, JobRunner, parser/chunker/indexer | Yullo source commands/adapters; no permanent `yullo_sources` |
| Conversation | `chat_sessions`, `conversation_logs`, `conversation_events`, shared `conversation_turns` | Aura runtime policy and public API; no permanent `yullo_aura_turns` |
| Cost/quality | `ai_usage_events`, evaluation infrastructure | Aura-specific expectations and attribution adapter |
| Home | canonical shared records | `yullo_home_events`, preferences, deterministic composition and API DTOs |
| Frontend | framework packages and truly neutral utilities only | all Yullo screens, state, clients, components, actions and themes |

After the user's revert, the working tree contains a migration candidate for `yullo_spaces` and shared ingestion fields, but their matching ORM code is absent. `yullo_sources` remains transitional; `YulloAuraTurn` is absent. Repair migration/model parity, migrate away from `yullo_sources`, and create only the neutral `conversation_turns` ledger. Never create a duplicate migration merely because a checklist says “create.”

## Global constraints

- Every database query must be scoped through the authenticated `User` and Yullo-owned Spaces.
- Home must filter `Space.product == "yullo"`; Support247 Spaces must never appear or contribute counts.
- Aura v1 remains isolated per Space. Aggregation may combine counts for the owner, but it must not merge Space knowledge or ask one Aura to reason about another.
- The Home read endpoint never invokes an LLM and never invents fallback metrics or recommendations.
- Unsupported or stale signals are omitted. The frontend already supports conditional sections and automatic layout recomposition.
- Reuse `spaces`, conversation tables, `ingestion_jobs`, `knowledge_bases`, `knowledge_base_items`, `kb_facts`, the existing JobRunner/pipeline, preferences, and Yullo auth. Migrate provisional `yullo_resources` to typed `yullo_space_entities` plus evidence.
- Reuse `knowledge_base_items` as the stable logical source/document identity and link every background job attempt to it. Extend the shared lifecycle schema, migrate then remove `yullo_sources`, and do not create parallel Yullo ingestion.
- Follow `yullo/auraplans/home/README.md#shared-database-reuse-decision` for the audited table-by-table decision and required corrections. The current `SpaceSource` onboarding path, provisional scalar entity provenance FK, and two item writers are not yet safe enough to treat as completed reuse.
- Do not reuse Support247 dashboard APIs, organization auth, frontend stores, or presentation components.
- Do not expose raw visitor messages, reasoning traces, personal identifiers, or private entities in Home analytics.
- Existing Home sections remain available and enabled by default; backend section preferences only control visibility/order.
- Work around unrelated dirty-worktree changes. Do not overwrite or reformat files outside this plan.

---


## Production execution authority

The six focused Home plans and their README now define the concrete production contracts. Read them before executing this overview. Their field mappings, transaction boundaries and function names supersede older checklist shorthand here. New functions are explicitly proposed; existing producer gaps were verified against repository code.

Persistence adds Home events/preferences, shared `conversation_turns`, conversation-event dedupe, generic lifecycle/version/idempotency/lease columns on shared items/jobs, typed Space entities and entity evidence. No `yullo_sources`, provisional `yullo_resources`, Yullo-specific turn/run, Yullo ingestion lease, or intelligence table remains after migration.

## Current backend audit

### Already present and reusable

- `app/yullo/api/home.py` exposes authenticated `GET /api/v1/yullo/home` with `Cache-Control: no-store`.
- `current_user` resolves the revocable Yullo HttpOnly session and enforces CSRF for mutations.
- `app/schemas/yullo_home.py` defines the initial account, preference, Space, attention, recent, and suggestion contract.
- `app/yullo/services/home/` already separates status, attention, activity, suggestions, and response composition.
- `ui/src/yullo/api/queries.ts` already contains a TanStack Query hook for `/yullo/home`.
- `ChatSession` provides Space, Aura runtime identity, status, message counts, and timestamps.
- `ConversationEvent` provides redacted lifecycle metadata, intent, retrieval usage, error codes, and timestamps.
- `KnowledgeBaseItem` is the stable source/document identity; linked `IngestionJob` rows represent processing attempts.
- `IngestionJob` provides queued/running/done/failed state and error context.
- `KBFact` provides review status, validity, version, and supersession metadata.
- `YulloSpaceEntity` provides grounded offerings, locations, portfolio items, contact channels, people, events and actions; `YulloSpaceEntityEvidence` provides source provenance.
- `YulloUserPreference` already owns theme/timezone at user scope.

### Incorrect or incomplete today

- The Space query does not filter `product == "yullo"`.
- Home returns a generated ID fragment instead of `Space.slug` and returns `None` for existing logo/description fields.
- Lifecycle is hardcoded to `live`.
- Status inputs for active jobs, failed sources, and knowledge review are hardcoded to false.
- Source counts are hardcoded to zero, so suggestions are incorrect.
- Conversation counts run once per Space and include no explicit `runtime_type == "aura"` restriction.
- `newConversationCount`, attention inputs, and enquiry counts are hardcoded.
- “Today” uses a naive UTC boundary rather than the stored user timezone.
- Recent activity reads only ChatSession starts, labels every item new, and may expose session titles.
- Aura runtime does not currently emit the redacted conversation events required for enquiries, momentum, repeated needs, or pattern evidence.
- Right now, For you, Quick insight, Orbit, evidence, section configuration, and freshness are absent from the backend response.
- `YulloHome.tsx` loads fixtures even though `useYulloHome()` exists.
- Nearby has no event provider; Connection has no Yullo network profile/membership model; anonymous returning visitors cannot be reliably counted.

## Supported scope by release

### Release 1: fully grounded Home

- Account and theme/timezone
- Yullo Space list and Pulse readiness
- Right now conversations and actionable issues
- Needs attention from real ingestion/knowledge state
- Recent Aura conversations and source changes
- Deterministic setup/source/entity suggestions
- Quick insight and Pattern only when intent/event thresholds are satisfied
- Orbit Pulse and Momentum when event evidence exists
- Persisted Home section visibility/order
- Frontend replacement of fixtures with the authenticated response

### Explicitly hidden until a real provider exists

- Orbit Nearby: requires normalized location plus an approved events/provider integration.
- Orbit Connection: requires a Yullo network profile, categories, visibility, and membership/connection semantics.
- Anonymous “returned more than once”: requires a privacy-reviewed stable visitor identity. Do not approximate it from IP, user agent, or raw session text.

The API represents unavailable collections as empty and optional signals as `null`, allowing the existing layout to collapse without placeholders.

## Target API contract

Extend `YulloHomeResponse` without adding parallel Home endpoints:

```text
account
preference
  appTheme
  timezone
  homeSections[]
spaces[]
rightNow
attention[]
forYou[]
quickInsight | null
orbit | null
pattern | null
recent[]
suggestion | null
generatedAt
```

Every intelligence item carries:

```text
spaceId when Space-derived
spaceName when Space-derived
evidence.sourceLabel
evidence.observedAt
action.kind
action.targetId when required
```

The backend returns typed actions, not frontend paths. The frontend maps action kinds to Yullo routes and omits unsupported actions.

## New persistence

### Extend `yullo_user_preferences`

Add `home_sections JSONB NOT NULL DEFAULT '[]'::jsonb`.

Store only validated entries shaped as:

```json
{"id":"orbit","enabled":true,"order":70}
```

Unknown IDs are rejected on write. Missing IDs inherit enabled defaults. The header, auth boundary, loading state, and page background are not configurable sections.

### Add `yullo_home_events`

Use this table only for sanitized, owner-visible non-conversation domain events. `ConversationEvent` remains the source for Aura conversation telemetry.

Columns:

- `id UUID` primary key
- `space_id UUID` required FK to `spaces.id`, cascade delete
- `event_type VARCHAR(60)` required
- `subject_type VARCHAR(40)` required
- `subject_id VARCHAR(120)` nullable
- `dedupe_key VARCHAR(180)` nullable
- `event_metadata JSONB` required, default `{}`
- `occurred_at TIMESTAMPTZ` required
- `created_at TIMESTAMPTZ` required

Indexes:

- `(space_id, occurred_at DESC)`
- `(space_id, event_type, occurred_at DESC)`
- unique `(space_id, dedupe_key)` where `dedupe_key IS NOT NULL`

Domain event types:

- `source.updated`
- `source.failed`
- `space.published`
- `entity.published`
- `opportunity.detected` only when a later durable notification/dismissal workflow requires persistence; release 1 recomputes opportunities and does not emit this event.

Metadata must stay low-cardinality and redacted. Store identifiers, counts, status, and category; never store visitor messages, credentials, access tokens, or reasoning.

## File map

File-status rule: “Create” means the path is absent in the post-revert audit; “Modify” means it exists. Re-check immediately before implementation because this working tree is active. Never create a second model/table/migration for an existing responsibility.

### Backend

- Create `app/models/yullo_home_event.py` — sanitized non-conversation event model; it is absent after the revert.
- Modify `app/models/yullo_user_preference.py` — persisted Home section configuration.
- Modify `app/models/__init__.py` — register the new model.
- Create chained Alembic migrations after inspecting the actual current head; use the complete persistence list in home/02-current-state-plan.md. Do not assume a fixed revision number or down_revision.
- Modify `app/schemas/yullo_home.py` — complete response, evidence, section preferences, signals, and typed actions.
- Create `app/yullo/adapters/home_events.py` — record sanitized Yullo domain events.
- Create `app/yullo/adapters/conversation_events.py` — emit Aura events into the existing `conversation_events` table with `runtime_type="aura"` and nullable `chatbot_id`.
- Create `app/yullo/services/home/repository.py` — grouped owner-scoped read queries.
- Modify `app/yullo/services/home/status.py` — real readiness inputs.
- Modify `app/yullo/services/home/attention.py` — real source/knowledge attention.
- Modify `app/yullo/services/home/activity.py` — merge redacted conversation and domain activity.
- Modify `app/yullo/services/home/suggestions.py` — grounded deterministic recommendation rules.
- Create `app/yullo/services/home/signals/` — Right now, Quick insight, Pattern, and Orbit rules.
- Modify `app/yullo/services/home/service.py` — compose the complete response without N+1 queries.
- Modify `app/yullo/config/home_rules.py` — thresholds, precedence, and supported section IDs.
- Modify `app/yullo/api/home.py` — GET response and CSRF-protected preference PATCH.
- Modify `app/yullo/services/inference/runtime.py` and `app/yullo/adapters/conversations.py` — persist Aura activity and update session timestamps safely.

### Frontend

- Modify `ui/src/yullo/api/queries.ts` — match the complete backend contract.
- Create `ui/src/yullo/home/apiAdapter.ts` — map API data to the presentation contract.
- Modify `ui/src/yullo/home/types.ts` — remove divergent duplicate wire types.
- Modify `ui/src/yullo/home/sectionConfig.ts` — merge backend preferences with defaults.
- Modify `ui/src/yullo/screens/YulloHome.tsx` — use `useYulloHome()` instead of fixture loading.
- Retain `ui/src/yullo/home/fixtures.ts` only for explicitly selected development/demo mode and visual state review.

---

## Task 1: Lock ownership and product isolation

**Files:** Modify `app/yullo/services/home/service.py`; create `app/yullo/services/home/repository.py`.

- [ ] Add one owner-Space query filtering `Space.owner_user_id == user.id` and `Space.product == "yullo"`.
- [ ] Return actual `Space.slug`, `display_name`, `logo_url`, `purpose`, `status`, `active`, `created_at`, and `updated_at` fields.
- [ ] Represent inactive Yullo Spaces as unavailable rather than dropping them silently.
- [ ] Never accept a client-supplied Space list for aggregation.
- [ ] Add an isolation check proving a Support247 Space owned by the same user cannot appear or affect counts.

## Task 2: Add Home persistence and preference mutation

**Files:** Create `app/models/yullo_home_event.py`; modify the existing `app/models/yullo_user_preference.py`; modify `app/models/__init__.py`; create only the missing chained migration operations; modify `app/schemas/yullo_home.py`; modify `app/yullo/api/home.py`.

- [ ] Apply the complete persistence specification in home/01-home-events-plan.md and home/02-current-state-plan.md, including event dedupe, shared ingestion reliability, entity/evidence lifecycle and the shared conversation-turn ledger.
- [ ] Create shared `ConversationTurn`; do not reintroduce `YulloAuraTurn`. If an external database has an earlier `yullo_aura_turns` table, conditionally migrate and drop it.
- [ ] Add Pydantic `HomeSectionId`, `YulloHomeSectionPreference`, and `YulloHomePreferenceUpdate` models with `extra="forbid"`.
- [ ] Validate IDs, booleans, unique IDs, and bounded integer order values on writes.
- [ ] Add `PATCH /api/v1/yullo/home/preferences`; rely on `current_user` for Yullo session and CSRF validation.
- [ ] Upsert `YulloUserPreference` for the authenticated user only.
- [ ] Return normalized effective preferences from both PATCH and Home GET.
- [ ] Do not expose a generic JSON settings mutation endpoint.

## Task 3: Replace N+1 and hardcoded Space metrics

**Files:** Modify `app/yullo/services/home/repository.py`, `status.py`, and `service.py`.

- [ ] Fetch all owned Yullo Space IDs once.
- [ ] Run grouped Aura-session aggregates over those IDs with `ChatSession.runtime_type == "aura"`.
- [ ] Calculate today boundaries from `YulloUserPreference.timezone`; fall back to UTC only when no valid timezone exists.
- [ ] Define active conversations as Aura sessions in `open`, `active`, or `queued` state with recent activity inside the configured active window.
- [ ] Count conversations started today and last activity per Space in grouped queries.
- [ ] Group Yullo sources by Space and join ingestion jobs for queued/running/done/failed counts.
- [ ] Count eligible published Yullo Space entities by type and Space.
- [ ] Count knowledge needing review from non-superseded `KBFact` rows with `review_status="extracted"`; do not call these conflicts.
- [ ] Feed real aggregate values into `calculate_space_status`.
- [ ] Return `newConversationCount` only when a real seen/unseen rule exists; otherwise omit it from the response instead of returning zero as fact.

## Task 4: Instrument Aura activity safely

**Files:** Create `app/yullo/adapters/conversation_events.py`; modify `app/yullo/adapters/conversations.py`; modify `app/yullo/services/inference/runtime.py`.

- [ ] Record redacted `message.received`, `retrieval.completed`, `answer.completed`, and error events in the existing `conversation_events` table.
- [ ] Set `space_id`, `session_id`, `runtime_type="aura"`, and the real Aura runtime/version identifiers when available; keep `chatbot_id` null.
- [ ] Do not use dummy zero UUIDs as Aura identity in Home attribution.
- [ ] Update `ChatSession.last_message_at` and commit session/log changes on successful message persistence.
- [ ] Populate only constrained intent values approved by the Yullo signal contract.
- [ ] Commit core message events with logs; optional telemetry uses SAVEPOINT isolation. Follow the precise transaction contract in home/01-home-events-plan.md.
- [ ] Exclude evaluation traffic from Home counts and Orbit signals.

## Task 5: Make readiness and Needs attention real

**Files:** Modify `app/yullo/services/home/status.py`, `attention.py`, `repository.py`, and `home_rules.py`.

- [ ] Derive learning/updating from current ingestion jobs rather than hardcoded flags.
- [ ] Create source-failed attention from a failed current job joined to its knowledge item, with real item/job targets.
- [ ] Create knowledge-review attention from extracted, valid, non-superseded facts; label it “needs review,” not “conflict.”
- [ ] Create missing-action attention only when no eligible `YulloSpaceEntity(entity_type="action")` exists and evidence shows repeated contact/booking intent.
- [ ] Mark a source stale only when its metadata contains a trustworthy `last_synced_at`/`next_sync_at`; absence of sync metadata is not evidence of staleness.
- [ ] Apply explicit precedence: unavailable, failed source/knowledge review, updating, learning, draft, live.
- [ ] Return at most the configured number of attention items, ordered by severity then recency.

## Task 6: Build a canonical Recent stream

**Files:** Create `app/yullo/adapters/home_events.py`; modify `app/yullo/services/home/activity.py`; emit domain events from the Yullo ingestion/entity/publication services that own those mutations.

- [ ] Read Aura conversation activity from `ConversationEvent`, not raw message text or session titles.
- [ ] Read source/publication/entity activity from `YulloHomeEvent`.
- [ ] Translate event types into stable owner-facing labels in the service layer.
- [ ] Merge, sort by `occurred_at`, and cap the cross-Space stream after merging.
- [ ] Define `isNew` using a persisted or request-level last-view watermark; until that exists, omit `isNew` rather than setting every event true.
- [ ] Store dedupe keys when producers may retry the same operation.
- [ ] Emit events in the same successful transaction as the domain change when practical; otherwise use idempotent post-commit recording.

## Task 7: Ground Right now, For you, Quick insight, and Pattern

**Files:** Create `app/yullo/services/home/signals/`; modify `suggestions.py`, `repository.py`, `home_rules.py`, and `app/schemas/yullo_home.py`.

- [ ] Build Right now from grouped active Aura conversations, validated enquiry events, and current attention count.
- [ ] Make each Right now number optional so unavailable evidence does not become zero.
- [ ] Replace hardcoded source count with canonical knowledge-item counts; never count attempts as sources.
- [ ] Detect actual location/action/offering availability from eligible typed Space entities.
- [ ] Rank deterministic For you suggestions by configured precedence and return no more than two.
- [ ] Attach Space ID, evidence source, observation time, and typed action to every recommendation.
- [ ] Produce Quick insight only from a supported current-period aggregate with a comparison baseline.
- [ ] Produce A pattern is emerging only when one constrained intent reaches the minimum distinct-session threshold within the configured period.
- [ ] Count distinct sessions rather than message rows to avoid one conversation inflating a pattern.
- [ ] Never quote raw visitor messages in these sections.

## Task 8: Implement grounded Orbit providers

**Files:** Create Orbit provider interfaces under `app/yullo/services/home/orbit/`; implement `pulse.py`, `momentum.py`, `null_nearby.py`, and `null_connection.py`; modify `signals/service.py` and schemas.

- [ ] Define a provider interface returning typed signals with kind, scope, prominence, evidence, relevance, action, and expiry.
- [ ] Pulse provider reads recent redacted Aura events for one owned Space.
- [ ] Momentum compares current and previous equal-length periods using distinct sessions/intents and enforces a minimum sample threshold.
- [ ] Nearby provider returns no signals until a normalized location and approved external event source are connected.
- [ ] Connection provider returns no signals until network profile/category/visibility semantics exist.
- [ ] Filter expired, unsupported, duplicate, and low-evidence signals before ranking.
- [ ] Return one dominant signal and at most three supporting signals.
- [ ] Keep all Space-derived signals tied to one owned `space_id`; no cross-Space knowledge retrieval is allowed.

## Task 9: Compose the complete Home response efficiently

**Files:** Modify `app/yullo/services/home/service.py`, `app/schemas/yullo_home.py`, and `app/yullo/api/home.py`.

- [ ] Use a repository result object so downstream rules consume one consistent snapshot.
- [ ] Execute grouped reads sequentially on the request AsyncSession; do not run concurrent queries on the same session.
- [ ] Remove all dummy counters, fake slug fallbacks, hardcoded live lifecycle, and unconditional “new” values.
- [ ] Include normalized Home section preferences in the response.
- [ ] Include `generatedAt` and evidence timestamps so the frontend can explain freshness.
- [ ] Keep `Cache-Control: no-store`; add request timing and result-count logs without user content.
- [ ] Return a valid empty Home for an authenticated owner with zero Yullo Spaces.

## Task 10: Connect the frontend to the real response

**Files:** Modify `ui/src/yullo/api/queries.ts`, create `ui/src/yullo/home/apiAdapter.ts`, modify `ui/src/yullo/home/types.ts`, `sectionConfig.ts`, and `screens/YulloHome.tsx`.

- [ ] Make `queries.ts` the single wire-contract definition matching Pydantic aliases.
- [ ] Map backend lifecycle/status/action/evidence values into the existing presentation model in `apiAdapter.ts`.
- [ ] Replace `loadYulloHomePresentation()` with `useYulloHome()` in production Home.
- [ ] Keep fixtures behind an explicit development/demo flag; never silently fall back to them after an API error.
- [ ] Merge backend section preferences with validated frontend defaults.
- [ ] Preserve all conditional band expansion and section registry behavior.
- [ ] Show the existing loading composition while the query is pending.
- [ ] Show a recoverable error state with Retry for network/server failure.
- [ ] On 401/403, use the existing Yullo client/store auth handling and do not render cached owner data.
- [ ] Map typed backend actions through one Yullo route resolver; omit unknown action kinds.

## Task 11: Add preference updates without coupling them to Home rendering

**Files:** Modify `ui/src/yullo/api/queries.ts`, `ui/src/yullo/home/sectionConfig.ts`, and the future Home customization surface.

- [ ] Add a mutation for `PATCH /yullo/home/preferences` using the existing CSRF-enabled Yullo client.
- [ ] Optimistically update only validated section visibility/order and roll back on failure.
- [ ] Invalidate `['yullo-home', authenticatedUserId]` after success.
- [ ] Keep the Home renderer driven by effective configuration, regardless of whether the customization UI is Profile or Home settings.
- [ ] Do not add section-toggle controls directly to the public Space or Aura chat UI.

## Task 12: Verification and rollout

Focus verification on isolation, correctness, and contract integration.

- [ ] Apply the new migration from current head and confirm downgrade removes only the new Home structures.
- [ ] Verify one user owning both Yullo and Support247 Spaces receives only Yullo data.
- [ ] Verify one user cannot retrieve another user’s Space counts, events, entities/evidence, or preferences.
- [ ] Verify grouped query count remains bounded as Space count grows.
- [ ] Verify failed/running/completed ingestion jobs produce the correct readiness and attention state.
- [ ] Verify absent enquiry, insight, pattern, Nearby, and Connection evidence yields omitted/null sections, not zero or generated copy.
- [ ] Verify Aura evaluation traffic does not affect Home.
- [ ] Verify section PATCH requires CSRF and rejects unknown/duplicate IDs.
- [ ] Run backend Home/auth model checks and Alembic upgrade.
- [ ] Run `npm run type-check` and `npm run build` from `ui/`.
- [ ] Review zero, one, three, six, and ten-Space Home responses in light, warm, and dark themes.
- [ ] Remove fixture use from the production path only after the real response renders every supported existing section.

## Completion criteria

- Production Yullo Home reads authenticated backend data instead of fixtures.
- Support247 Spaces and activity cannot enter Yullo Home responses.
- Current-state metrics use grouped canonical queries with no per-Space count loop.
- Attention, recommendations, patterns, and Orbit signals are evidence-backed and omit unsupported claims.
- Existing Home sections remain intact and configurable.
- Nearby, Connection, and anonymous return claims remain hidden until their required providers and privacy model exist.
- The frontend and backend share one explicit contract, with safe loading, empty, error, and stale-data behavior.

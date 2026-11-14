# Yullo Home In Your Orbit Implementation Plan

## Nearby browsing — 2026-11-12

User-authorized extension: separate, compact Home discovery section, independent of Orbit and owner analytics. Use canonical public Yullo location/event entities, not an external feed or cross-Space Aura context.

- [x] Add strict discovery request/response contracts and owner-authorized saved origins.
- [x] Read active/live Yullo Spaces and confirmed public entities through existing eligibility rules; enforce direct/public field disclosure before matching or output.
- [x] Isolate pure ranking: within 10 km, then explicit city match, then explicitly remote; use region/country matching when finer area details are absent. Deduplicate before selecting 10. Exclude expired events and resolve event locations only within the same Space.
- [x] Extend location JSON/form with optional city/region/country and explicit remote mode, preserving existing physical locations. Public visibility opts into discovery; private locations may be owner-only browsing origins.
- [x] Add independently fetched, collapsible Nearby UI with automatic location resolution, loading/error/empty states, theme tokens and keyboard controls. No filters, fields, location buttons or permission prompts.
- [x] Verify compilation/static checks, inspect final diff, record integration gaps. No migration, external provider, data writes or new unit tests required.

Implemented boundaries: `app/yullo/schemas/nearby.py`, `app/yullo/services/home/nearby/{repository,ranking,service}.py`, `app/yullo/api/home.py`, and additive location/event fields in `app/yullo/services/entities/payloads.py`; frontend `ui/src/yullo/api/nearby.ts`, `components/home/Nearby.tsx`, `screens/YulloHome.tsx`, `forms/{LocationForm,Locations,GoogleLocationPicker}.tsx` and `forms/googleLocationMaps.ts`. Existing map selection supplies explicit city/country components when available. Ranking is linear over eligible records, with a bounded top-10 selection after deduplication; no per-Space query loop or duplicate storage.

Endpoints: authenticated `GET /api/v1/yullo/home/nearby/locations` (owned origins, including private records), read-only `POST /api/v1/yullo/home/nearby` (public discovery only). Coordinates stay out of URLs/logs; both responses are no-store. Nearby queries are owner-keyed, memory-only, cancellable, and fetched only when expanded. No external feeds or changes to existing Orbit providers.

Copy follow-up: `Nearby.tsx` now leads with “Discover what’s around you,” supporting details about local Spaces, events, city and online discovery, and an “Explore nearby” action. Description width is bounded for readability. Source wording reviewed against actual behavior; ranking/endpoints unchanged. Tests remain skipped at the user’s request.

Simplification follow-up: removed scope buttons, saved-location dropdown and manual city/country form from `Nearby.tsx`. Home now shows one automatically ranked list using the first saved origin, with a current-location action only when no saved origin is available. Old `nearbyScope` URL values are ignored/cleared on expand or close. Backend scope support and canonical location editing remain available; existing ranking is preserved. TypeScript and diff checks passed. Tests remain skipped; browser verification remains pending.

Automatic-location follow-up (supersedes previous origin/button behavior): removed all location controls and hints from `Nearby.tsx`. New `ui/src/yullo/home/useNearbyLocation.ts` checks existing browser geolocation permission and uses coordinates only when already granted, with a bounded lookup and silent fallback. Missing/denied/prompt permission never opens a prompt. Empty-area discovery requests resolve the richest authorized saved origin server-side in `nearby/service.py`; fallback uses explicit city, region, country, then remote availability, without locale/IP/timezone guesses or cross-Space Aura context. Region/country-only locations are supported in schemas, ranking and canonical location editing; existing Google map selection captures region components when supplied. The UI no longer calls the separate origins endpoint. Coordinate-bearing saved origins still support 10 km discovery when browser coordinates are unavailable. Region/country broaden matching only when finer origin details are absent, preserving the original 10 km → city → remote priority when city is known. Updated `schemas/nearby.py`, `nearby/{repository,service,ranking}.py`, entity payload validation, frontend Nearby types, location form/map types and helper. TypeScript, backend imports, UI static scans and diff checks passed. Tests remain skipped by user; live geolocation/API verification remains pending. No migration or data write.

### App-load collection and private metadata — latest approved behavior

The user approved a fallback “Use my location” button and saving location with IP metadata. This supersedes the no-location-button behavior above.

- [x] Collect automatically when authenticated Yullo app providers mount, independent of Nearby expansion. Existing browser permission is used silently; the fallback button may request browser permission. Lookup and save have separate timeouts; no continuous tracking or duplicate per-component acquisition.
- [x] Persist one latest private account record in `yullo_user_locations`: area, accuracy in metres, browser capture time, server receipt time, source, server-observed IP and IP observation time. No location history, public profile fields, logging of coordinates/IP or third-party IP lookup. IP is validated using the existing trusted-proxy resolver; client-provided IP/user IDs are rejected/not accepted.
- [x] Add authenticated/CSRF-protected `POST /api/v1/yullo/home/location`. Empty observations update IP without erasing saved coordinates. Concurrent/stale updates preserve newer capture/IP timestamps. Response contains only the owner's usable area, never IP metadata. Captured times are validated; discovery reuses saved areas for at most 24 hours, then falls back to canonical saved Space area and remote results.
- [x] Keep collection/save failures separate from discovery, preserve in-memory coordinates for the current visit, and show a plain save-failure message. Owner-specific memory, request account headers and cancellation prevent stale observations crossing logout/account switches. Shared user preferences/login/public Aura are unchanged.
- [x] Add migration `b9c0d1e2f3a4_yullo_user_location.py` after verified applied revision `a7b8c9d0e1f2`; applied **only** to the verified loopback development database. No production migration/data modification. Pending migration reads fail within a savepoint and preserve original discovery fallback.

Changed boundaries: `app/yullo/models/{user_location.py,__init__.py}`, `schemas/user_location.py`, `services/home/nearby/user_location.py`, existing Home router/discovery service; `ui/src/yullo/services/location.ts`, `providers/YulloLocationProvider.tsx`, existing app providers, Nearby component and location hook. No new tests; previous skip request remains in effect. TypeScript, backend route/model imports and PostgreSQL table-DDL compilation passed; final build/schema verification recorded below. Actual browser acquisition and authenticated metadata-save integration remain unverified without a user browser session.

Final verification: production frontend build passed; Python parsing, UI static scans and diff checks passed. Read-only database inspection confirmed applied revision `b9c0d1e2f3a4` and existence of `yullo_user_locations` in local development. No user records were read or seeded for verification. Browser capture and authenticated saving remain unverified; tests remain skipped.

Verification: TypeScript check and production build passed; six changed Python modules parsed and Home router imported successfully with process-local `DEBUG=false` (host DEBUG was `release`). New Nearby UI anti-slop/motion scans and `git diff --check` passed. Tests explicitly skipped by user. Browser host was unavailable and native Chrome access was not approved, so visual checks and authenticated database-backed behavior remain unverified. No migrations created/applied and no database data changed. Follow-up: run focused location/entity tests and exercise populated/empty/error discovery, owner-origin isolation, field-policy exclusion, event expiry and top-10 ranking when testing is authorized.

**Goal:** Build the irregular Orbit mosaic from grounded providers while keeping unavailable Nearby and Connection signals absent.

**Architecture:** Orbit is a provider registry over the same Home snapshot. Each provider returns typed candidates; one shared filter/ranker selects one dominant and up to three supporting signals. Providers do not write UI copy to tables.

**Depends on:** `03-intelligence-signals-plan.md`

## Reuse boundary

Pulse and Momentum reuse already-authorized aggregates from `HomeSnapshot`; they do not query or copy conversation text. The provider protocol/ranker is Yullo-owned because its relevance and UI contract are product behavior. Future external Nearby or Connection adapters may reuse neutral HTTP/cache primitives, but their provider records, consent, expiry, and relevance rules require explicit schemas and cannot be stored as conversation events or inferred from knowledge documents.

## Provider contract

Create `app/yullo/services/home/orbit/base.py`:

```python
class OrbitProvider(Protocol):
    kind: OrbitSignalKind
    def collect(self, snapshot: HomeSnapshot, config: HomeRules, now: datetime) -> list[OrbitCandidate]: ...
```

Each candidate contains scope, Space identity when applicable, metric, evidence, relevance, typed action, prominence score, and expiry. The registry is configuration driven so providers can be enabled/disabled without changing composition code.

## Release-1 providers

### Pulse

Input: recent Aura `conversation.started`, approved intent, retrieval, and answer events for one owned Space.

Generation: group by Space and bounded window; count distinct sessions; qualify only above a minimum sample. Example: “Northstar is getting noticed” with `7 visitor sessions in 7 days`. “Returned more than once” remains prohibited until a privacy-reviewed stable visitor identity exists.

Files: `app/yullo/services/home/orbit/pulse.py`.

### Momentum

Input: controlled intent events in current and preceding equal windows.

Generation: require minimum samples in both periods and a configured increase. State only the measured category movement. Example: “Booking questions increased” only when booking intent counts meet the exact comparison thresholds in plan 02. Travel is not an approved intent; no travel trend is available.

Files: `app/yullo/services/home/orbit/momentum.py`.

### Nearby

Release 1 uses `NullNearbyProvider`, returning `[]`. Do not infer location from IP, browser locale, Space name, document text, or user profile prose.

Future activation requires:

- an eligible `yullo_space_entities(entity_type='location')` record with explicit coordinates, visibility and radius settings; owner confirmation or an approved authoritative integration is required;
- an approved external events/place provider;
- provider item ID, source name, coordinates/distance, start/end time, fetched time, expiry, and relevance link to an explicit category/interest;
- background sync that normalizes external data into a provider-owned cache, not `yullo_home_events`.

Files: `app/yullo/services/home/orbit/null_nearby.py`; future `nearby_provider.py` and provider cache migration in a separate plan.

### Connection

Release 1 uses `NullConnectionProvider`, returning `[]`. Do not infer social/network links from shared document words.

Future activation requires public Yullo network profiles, categories, visibility, membership/connection semantics, block/privacy rules, and a mutual relevance algorithm. That belongs in a separate network subsystem plan.

Files: `app/yullo/services/home/orbit/null_connection.py`.

## Selection and UI mapping

Create `app/yullo/services/home/orbit/service.py` to:

1. collect candidates from enabled providers;
2. revalidate owned Space scope and evidence freshness;
3. remove duplicates and overlaps with stronger attention items;
4. select the highest-value dominant signal;
5. select at most three diverse supporting signals;
6. return `null` when no provider has valid output.

The API returns typed actions such as `view_conversation_pattern`, `open_space`, `add_to_space`, or `view_opportunity`. The frontend resolves routes and uses the existing editorial mosaic. Unknown actions are omitted.

## Motion and presentation boundary

The backend supplies semantic roles (`dominant`/`supporting`, kind, metric, evidence). It does not send animation instructions, coordinates, CSS, or arbitrary HTML. The frontend owns Notice, Connect, Activity, and Reveal motion and honors reduced motion.

## Implementation steps

- [ ] Define provider and candidate contracts.
- [ ] Implement Pulse and Momentum from the snapshot.
- [ ] Implement explicit null providers for Nearby and Connection.
- [ ] Add configuration-driven provider registration.
- [ ] Add shared validation/ranking/diversity selection.
- [ ] Map results to the API Orbit schema.
- [ ] Keep the entire section absent when no candidate qualifies.

## Completion evidence

- Orbit displays only Pulse/Momentum backed by current events.
- Nearby and Connection are invisible, not fixture-backed.
- Each Space-derived signal remains scoped to exactly one owned Space.
- Provider failures omit that provider and do not break Home.


## Concrete orchestration contract

Create `orbit/registry.py:build_orbit_providers(config) -> tuple[OrbitProvider,...]`. Inject `PulseProvider`, `MomentumProvider`, `NullNearbyProvider`, `NullConnectionProvider` into `orbit/service.py:collect_orbit_candidates(snapshot,config,now)`. These are synchronous pure functions; they consume plan 02 aggregates and perform no I/O or database writes.

`PulseProvider.collect`: for each owned Space, take production conversation.started DISTINCT session_id count in the last7d; require >=5; construct candidate `pulse:{space_id}:{day_anchor}:v1`, title='{count} conversations this week', evidence with actual count/window/latest event. Do not count empty sessions, message rows, or unique visitors.

`MomentumProvider.collect`: call `signals/momentum.py:evaluate`; reuse its rule/evidence family unchanged so Home cannot present the same claim twice. Candidate expiry is window_end+24h. All candidates are recomputed each GET.

`select_home_signals` applies enabled sections, assigns evidence families globally, then `orbit/service.py:compose_orbit(selected)` sorts by priority desc, observedAt desc, stable id asc. Highest eligible item becomes dominant; at most3 remaining candidates become supporting. Prefer different Spaces and different signal kinds for supporting slots; fewer than4 is valid. Zero items =>null. One item expands in UI.

No Nearby input writer exists, so NullNearbyProvider returns []. No network graph/membership writer exists, so NullConnectionProvider returns []. No LLM fills these gaps. Enablement is `orbit.providers.pulse=true,momentum=true,nearby=false,connection=false`; enabled unavailable providers still return no fabricated data.

Example: 8 distinct production sessions for S qualifies one pulse; all other owned Spaces below5 => one dominant pulse and no supporting items. A refresh with no new event produces the same ID. Hide Orbit via preference => no Orbit section; other sections can receive otherwise eligible candidates.

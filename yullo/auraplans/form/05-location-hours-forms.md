## Implemented approved slice — 2026-10-19

Space dashboard has Locations beside Booking/Appearance. Add location opens the editor directly in one click; saved branches and Edit actions stay visible. Owners can add multiple independent location entities and edit each branch with its existing revision. The address field provides Places (New) suggestions while typing; choosing a suggestion fills the draft's location name, address, city, state/region, country and PIN/postal code. City/state use the same native searchable-dropdown control, with manual entry preserved. Map-click and marker-drag selections fill details through reverse geocoding without another confirmation button. Save location persists the reviewed draft. Existing owner labels remain unchanged unless empty/previously auto-filled. Manual address/area/map-link edits invalidate stale coordinates and pending lookups. Existing coordinates and public/private state reload from each entity.

### Direct-open/autofill completion — 2026-11-12

Map-link/pin follow-up: removed the Map link (optional) editor field. Internal generated/legacy direction links remain compatible with existing canonical payloads. Current location still initializes new drafts automatically. Address/city/state/postal edits were removing the marker because they cleared stale saved coordinates; the form now retains a separate visible pin while those coordinates remain invalidated, with a prompt to select an address or adjust the pin. Choosing a suggestion, clicking/dragging the map or current-location initialization updates the visible pin and draft coordinates together. Explicit Remove pin still clears both. Existing saved locations remain intact; no backend or migration changes. TypeScript and diff checks passed; tests remain skipped, and live map rendering remains dependent on the previously confirmed Google referrer restriction.

Current-location default follow-up: new physical-location drafts preselect the actual current browser fix from `YulloLocationProvider` as soon as available, set its pin/map link and reverse-geocode address/name/city/state/postal details once Maps is ready. Existing entities retain their saved locations; late GPS responses do not replace an owner-entered address. Initial automatic defaults do not alone mark the form dirty or save a Space entity. The existing permission flow is reused: a Use my current location fallback requests permission only on click, and that explicit action may replace a draft selection. Manual edits invalidate pending reverse lookups. Provider publishes current coordinates before waiting for metadata persistence and keeps live browser coordinates ahead of returned historical metadata. Updated `LocationForm.tsx`, `GoogleLocationPicker.tsx` and `YulloLocationProvider.tsx`; no backend/schema changes. TypeScript and diff checks passed; tests remain skipped. Live map/reverse-geocoding verification still depends on resolving the confirmed Google referrer restriction below.

- [x] Fix SpaceDashboard duplicate sibling React keys: `booking:${spaceId}` / `locations:${spaceId}`.
- [x] Remove Manage locations → Add location disclosure and Search map/Use this location steps. Keep one direct Add action, explicit Save, revision checks and remote/manual flows.
- [x] Isolate address/city/state suggestions in `LocationSearchField.tsx`, Places adapter in `googleLocationPlaces.ts`, and map/pin reverse lookup in `GoogleLocationPicker.tsx`. Reuse existing SDK singleton, public API key setting, area parser, form fields and canonical entity CRUD; no new dependencies.
- [x] Debounce typed suggestions 250 ms with a 2-character minimum, use billing session tokens, discard stale requests and fetch only selected place fields. Keep suggestions in component memory and show Google Maps attribution. Existing/private addresses are not queried on initial focus without editing.
- [x] Autofill/edit/save optional `postal_code` (validated server-side in existing LocationPayload; JSON field, no migration), rename Place name to Location name, retain user labels, and disable Save while selected-place details resolve.
- [x] Update the existing location tests for the changed controls/flow without adding cases. Tests remain skipped by prior user instruction. TypeScript/production build, backend schema import, focused UI static scans and diff checks passed. Browser/live Google behavior remains unverified.

Confirmed external blocker: user's Console reports `RefererNotAllowedMapError`. Google key website restrictions must allow `http://localhost:3000/*` (and `http://127.0.0.1:3000/*` if used); this cannot be fixed in frontend code. Places API (New) must also be enabled/allowed for type-ahead. Google project restrictions have not been modified. Successful SDK download alone does not verify authorization. No backend endpoints changed in this follow-up; owner publication/extraction pipelines remain intact.

Reuses canonical entity POST/PATCH and existing owner boundaries. No backend, schema, database, booking or Appearance changes. Only the SpaceDashboard import/Locations row connects the new implementation. Appearance's previously discussed presentation-only changes are NOT implemented; those require separate approval.

### Google Maps configuration (operator action)

2026-11-12 update: user-provided Yullo browser key configured in ignored `ui/.env.local`; credential omitted from tracked files and documentation. `ui/.env.example` now documents the existing Maps key/map ID settings. Existing SDK loader and development `DEMO_MAP_ID` fallback reused; no additional provider or paid API probe introduced. Effective Vite development configuration checked without printing the key. Live Google API availability/restrictions remain unverified; tests remain skipped as requested.

Live verification follow-up requested by user: Google Maps JavaScript SDK returned HTTP 200 with a non-empty script and no recognized key/activation/referrer/billing error marker in the response. One sample Geocoding REST request was denied because the key has HTTP-referrer restrictions; this does not establish whether the browser's JavaScript Geocoder works. Do not remove browser-key restrictions to make a server probe pass. Browser access host remains unavailable, so actual map rendering and browser geocoding remain unverified. No user location was transmitted by these checks, and the credential was omitted from all output.

Running localhost:3000 verification: Vite served the Maps module with HTTP 200, the configured key present and the existing loader intact. Output included booleans only, never the key.

Authorization-error follow-up: user reports Google's generic failed-map overlay. HTTP 200 SDK download is not authorization evidence. Consulted Google error reference and documented `gm_authFailure` callback; actual console error code is requested and still required to distinguish referrer denial, API activation, billing and other causes. Updated `googleLocationMaps.ts` to subscribe to authorization failures before loading and reject failed/cached unauthorized SDK use. Updated `GoogleLocationPicker.tsx` to handle late failures, invalidate pending searches, clear transient candidates/listeners, hide the failed Google canvas and preserve manual address/map-link entry with plain recovery copy. Successful map search/pin/drag flows remain intact. TypeScript and diff checks passed; tests remain skipped. Google project settings and successful rendering remain unverified/unfixed pending the console code.

Picker-first follow-up: `LocationForm.tsx` now places the location picker before name/address details and focuses its address search when available, using name focus for remote/manual-only forms. `GoogleLocationPicker.tsx` mounts its search and map immediately when the editor opens; removed the extra Open map disclosure. Explicit candidate confirmation and Save location, remote-only editing, manual fallback and auth-failure recovery remain intact. Existing picker test adjusted to the direct-open flow; no new test cases. TypeScript and diff checks passed; tests remain skipped and visual behavior is unverified. Google authorization issue above remains unresolved independently of this layout change.

In the existing UI environment configuration (for example ui/.env.local), set:

```dotenv
VITE_YULLO_GOOGLE_MAPS_API_KEY=<browser-restricted Google Maps key>
VITE_YULLO_GOOGLE_MAPS_MAP_ID=<JavaScript map ID>
```

Enable Maps JavaScript API, Geocoding API and Places API (New) on the Google Cloud project with billing configured. Restrict the browser key to the actual application HTTP referrers and these APIs; allow localhost explicitly for development. Browser keys are public configuration, not server secrets. Use a production map ID; DEMO_MAP_ID is the development fallback. Reload after Cloud restriction changes; restart Vite/rebuild after environment changes. No credential was added to tracked files.

SDK loads when the physical-location editor opens. No key: manual entry remains available. SDK failures/timeouts show a manual-entry fallback. Places (New) loads on a typed query of at least two characters, with selectable address/city/state suggestions and no search button. No LLM calls. Pin geocoding handles stale responses and cleans up map event listeners on unmount. Google attribution remains visible.

Files: ui/src/yullo/forms/LocationForm.tsx, Locations.tsx, GoogleLocationPicker.tsx, googleLocationMaps.ts, their focused tests, and ui/src/yullo/screens/SpaceDashboard.tsx.

Verification: six focused tests pass (manual fallback, search confirmation, click/drag pins with mocked SDK, validated save, stale pin removal, failure retention, multiple branch list/edit). TypeScript and focused lint pass. Real Google Maps loading, browser/mobile visuals and live API persistence require configured credentials and remain unverified. No user records were written during tests.

Google references: https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-draggable and https://developers.google.com/maps/documentation/javascript/geocoding

---

# Location and opening hours — UI and backend implementation plan

Date: 2026-09-22. Self-contained form plan. Shared requirements are embedded below; sibling plans are optional references. All paths/functions below are implementation targets unless marked existing.

## Placement and interaction

Details → Locations manager; single location quick editor with Hours secondary editor linked to that location.

Open **Locations** as `/yullo/spaces/:spaceId/locations`, a dedicated manager. Use one editorial row per location: name and safe public locality on the left, Open/closed or hours completeness as secondary text, Edit on the right. Do not show map-dashboard cards. **Add location** and Edit open the right sheet; order fields as Name, Presence/service area, Address/locality, Map, Visibility. Opening hours is a secondary section in the same draft when short, or a linked second sheet after the location has an ID; use seven compact day rows and reveal split hours only when requested. Mobile uses fullscreen editors and preserves the manager position on return. Address privacy is explained beside the visibility control, not in a warning card.

## Fields and canonical storage

`settings` means `yullo_configs.settings`. `payload` means the selected entity's validated `payload_json`. New does not mean already accepted by current strict schemas.

| Field | UI, requirement and validation | Storage / compatibility |
|---|---|---|
| Place name | Required <=200 | location.payload.name; existing |
| Address | Optional full text <=1000 if city-only; required for exact display | payload.address; existing v1 requires it, v2 conditional |
| City / region / country | Required city for area-only; optional otherwise | proposed payload.locality/region/country_code |
| Coordinates / map URL | Optional paired range-checked coordinates, HTTPS map | existing latitude/longitude/map_url |
| Display precision | exact/city/hidden | payload.address_precision; new; server strips exact fields |
| Visibility / disclosure | Four scopes; private default sensitive data | entity policy |
| Timezone | Required when hours supplied, IANA | payload.hours.timezone; new |
| Week schedule | 7 weekdays; closed or 0–2 periods; start/end and next-day flag | payload.hours.weekly; new |
| Copy weekdays | UI-only operation applied to draft | no separate DB field |
| Service area | Optional named areas <=20 | payload.service_areas; new |

## API, authorization and writer functions

Common entity CRUD for location. PATCH B/entities/{id} with expected_revision saves location and hours atomically; `validate_opening_hours` checks overlaps, valid local times and explicit overnight periods. Hours are optional; unknown differs from closed. Named timezone retained; calculate next opening from timezone-aware dates. Address autocomplete via configurable geocoder is optional with manual entry always available; keys stay server-side.

All owner routes use the embedded owner guard and revision checks. Client cannot set origin/review status/source authority. Server validates on every entry path including bootstrap and extraction. API success returns canonical saved values; field errors remain beside fields; stale revisions never silently overwrite another edit. Public responses use the embedded visibility projection, not owner DTOs.

## Files to implement or extend

- Create `ui/src/yullo/forms/locations/LocationHoursForm.tsx` and `schema.ts`; manager components beside them where this plan specifies collections.
- Extend `ui/src/yullo/api/spaceForms.ts` with typed hooks for the above endpoints; route via SpaceOverview registry.
- Extend `app/yullo/services/persistence/entities.py`; keep location and hours payload validation with entity persistence. Register thin routes in `app/yullo/api/space_data.py`.
- Extend existing entities/payloads.py and entities/service.py; use owner entities router as specified in this file. Do not introduce another entity repository.
- Update public serializer, runtime reader and existing relevant UI renderer to consume the same published, policy-filtered contract.

## Compatibility and migration work

No hours payload exists now. Add v2 location schema and compatibility projection; no new locations/hours tables needed for v1. City-only disclosure MUST remove address/coordinates/map URL everywhere including tools and caches; never send full address and merely hide it in CSS. Reject foreign-Space location references. Special/temporary hours are explicitly deferred, not shown as supported.

Preserve version1 reads when introducing version2 payloads. Conversion is deterministic and lossless where possible; unsupported old content stays owner-visible for review. Store payload version2 only after every writer/reader supports it. Never loosen `extra=forbid` merely to accept UI fields. Missing backing fields disable that control until its schema and save path ship together.

## UI, motion and libraries

Address search uses 400ms debounce, no provider means manual field. Hours weekday rows use TimeRangeField; copy Monday to weekdays is one reversible draft action. Small reveal for second period 220ms. Mobile single-column days and 52px time inputs; keyboard reachable Closed controls.

Use React Hook Form + Zod, Yullo-owned fields, TanStack Query, Radix primitives and `motion/react` as specified in this file; semantic theme tokens and 52–56px controls. Blur validation and Save revalidation. Save progress follows actual server response. Reduced motion disables movement. No Support247 UI component reuse.

## Data flow and implementation steps

- [ ] Add field schemas and explicit storage mapping above; add only required forward migrations from compatibility section.
- [ ] Implement/readapt named backend functions with ownership, same-Space references, concurrency, policy and canonical save DTO.
- [ ] Implement GET loading and one create/edit form, progressive optional groups, dirty tracking and visible field errors.
- [ ] Wire Save to the exact endpoint; commit data and approved event atomically; run canonical context/publication finalizer and invalidate affected owner/public/Home caches.
- [ ] Wire list/update/archive/reorder only where specified. Check references before archive; retain evidence/audit information, schedule unused blob cleanup after commit.
- [ ] Integrate Aura suggestions as private review candidates; owner acceptance uses the same save function. Suggestions cannot override owner-authored values.
- [ ] Update bootstrap input adapter to call the same service where this form is supported; do not insert form data directly into DB to demonstrate success.

## Acceptance checks

Save -> reload -> reopen must return identical normalized fields. Exercise create/edit with two Spaces and a foreign owner denial; rejected writes leave no partial public changes. Check required/conditional fields and removed values, policy projection in page and chat, keyboard/mobile/reduced motion, retry behavior and one stale revision. Verify public rendering only after canonical publication, with no synthetic timestamps or guessed content. Collections preserve order; empty optional forms do not block launch.

## Standalone session contract — revision 2026-09-22.2

This file contains the requirements needed to implement this form without conversation history or reading sibling plans. Sibling links are optional background. Inspect the repository files named here; existing-code compatibility cannot be established from a document alone. This is a form-scoped task, not authorization to implement all Space forms.

### Start here

1. Read applicable AGENTS.md, inspect git status and this form's existing UI/schema/API/service files. Preserve unrelated and uncommitted work. Paths below are relative to repository root `/Users/aks/Projects/support247_bobathon`.
2. Check existing shared form components, policy functions, router registration, database revision and installed package versions. Proposed interfaces may already have been implemented by another session; extend their current contracts compatibly rather than replacing them.
3. Report a short gap list for this form, then implement the smallest complete create/edit/read slice. Build only its required shared primitives. No need to read or execute the whole plan directory.
4. Resolve dependency gaps using the local dependency instructions below. Ask only for a genuine product conflict or a destructive choice; do not invent provider availability, schema fields or approvals.

### Product and entry context

Home -> Your Spaces -> Open Space -> `/yullo/spaces/:spaceId`. The owner overview has Identity, What Aura knows, Details, Aura and Appearance summary rows. Edit opens a focused editor; Manage opens a collection. Keep Home and public chat design intact. Wrap owner routes in existing `YulloPrivateRoute` and derive session through existing Yullo API client. If the overview is absent, add this form's smallest working overview entry using the shared route; do not rebuild unrelated sections.

Types are business/creator/person/organization; capability registry controls modules without creating four products. Owner can add supported modules. Only type/name/valid handle block launch; knowledge readiness is separate. A source-empty public Space cannot claim Aura is trained. There is one isolated Aura per Space; no cross-Space delegation. Backend shared infrastructure may be reused; frontend components must stay under `ui/src/yullo/`, never import Support247 UI.

### Exact visual and interaction contract

Use the installed React Hook Form + Zod/resolvers for local form state and validation, TanStack Query for server state, Radix Dialog for sheets/confirmations, Radix Popover/Select only where appropriate, and `motion/react` for restrained transitions. Reuse installed dropzone, date-fns and Lucide where this form needs them. Optional cmdk is limited to genuinely searchable pickers. A Popover alone is not a combobox: provide listbox semantics and complete keyboard behavior. Do not add or use MUI, Ant Design, Chakra, a second broad primitive system, Support247 components, Support247 CSS, or Support247 layout wrappers.

Shared components live in `ui/src/yullo/forms/core/`; form state is local and saved state is server-authoritative. Extend the existing Yullo theme provider under `ui/src/yullo/theme/`; do not create a competing provider. Owner editors always use the app theme (`light|dark|system`). A public Space presentation theme is allowed only inside an isolated preview subtree and must never recolor the editor shell.

Exact owner-app tokens:
- Light: canvas `#F6F7F8`, surface `#FFFFFF`, surfaceRaised `#FCFCFD`, surfaceSoft `#EEF1F4`, text `#151B27`, textMuted `#667085`, border `rgba(21,27,39,.12)`, borderHover `rgba(21,27,39,.24)`, focus `#4EA6CF`, focusSoft `rgba(78,166,207,.18)`, accent `#E4CC32`, danger `#C94343`.
- Dark: canvas `#11151C`, surface `#171C24`, surfaceRaised `#1D232C`, surfaceSoft `#202731`, text `#F5F7FA`, textMuted `#A7B0BD`, border `rgba(245,247,250,.12)`, borderHover `rgba(245,247,250,.24)`, focus `#73CBE8`, focusSoft `rgba(115,203,232,.18)`, accent `#E8D84E`, danger `#FF8585`.
Map these through semantic CSS variables; do not hardcode them in individual components. Yellow is a small identity/accent/status mark, never body text on white and never the default large button fill. Primary action is text-colored in light mode with white label and the inverse in dark mode; secondary actions are quiet/transparent; destructive actions use danger only.

The visual language is editorial, calm and spacious. It must not resemble Support247, a generic admin dashboard, or a SaaS card grid. Prohibited defaults: boxed card per section, icon tile beside every heading, dashboard KPI cards, thick shadows, glass panels, saturated gradients, pill badges for ordinary metadata, floating rounded containers around every row, and copied Support247 spacing/colors. Use the app canvas as the page background, typography and whitespace for hierarchy, thin full-width rules between major bands, and raised surfaces only where interaction or preview containment needs one. Manager collections are borderless groups of 72–88px rows with a single bottom rule, clear primary text, restrained metadata and a right-aligned action; do not wrap every row in a card.

Use Satoshi for display headings and Instrument Sans for body where already loaded. Page titles are 32–36px/1.1, sheet titles 24px/1.2, section titles 12–13px uppercase with .08em tracking, body and input text 16px, helper/error text 14px. Labels remain visible above inputs; never use floating labels. A field is full width, at least 52px high (56px for touch-heavy controls), padding 14px 16px, radius 12px, surface background and 1px border. Hover changes only border color. Focus uses the cool focus border plus a 4px focusSoft ring. Textarea minimum height is 120px. Keep 12px label-to-control spacing, 8px control-to-helper spacing, 20px between related fields, 32px between groups and 48px between major sections. Untouched fields remain neutral; errors appear beside the field without shaking or shifting the whole page.

Desktop Quick Editor (>=768px) is a right sheet: `width:clamp(420px,38vw,560px)`, maximum `calc(100vw - 32px)`, surface background, 1px left border, no decorative gradient, and a light-mode backdrop equivalent to `rgba(11,18,32,.08)`. Keep the Space overview visible below it. Structure it as fixed header, independently scrolling body and sticky action footer. Below 768px it becomes a full-viewport editor with 16px minimum input font, Back/title header, one Save action, safe-area padding and a sticky footer. Dedicated managers remain pages: max-width 1100px, margin auto, padding `32px 24px 80px`; use `16px` horizontal padding below 768px. At 768–1199px collapse secondary columns before reducing field widths. Appearance uses a split editor at >=1024px and stacked controls/preview below; phones use Edit/Preview tabs only if the stacked preview becomes too tall. Confirmations alone use centered dialogs, max-width 420px. Review at 360, 768, 1024 and 1440px.

Motion tokens are fast140/base220/sheet260ms with easing `[0.22,1,0.36,1]`. Sheet entry is opacity0/x20 to opacity1/x0 in220ms; exit x12/opacity0 in180ms. Page content enters opacity0/y4 to opacity1/y0 in180–220ms. Errors enter opacity0/y-4 in160ms. Optional fields reveal height0-to-auto/y-4-to0 in220ms; new rows enter opacity0/y6 in200ms. Status changes crossfade in140–180ms; Appearance preview theme changes crossfade180ms. Convert milliseconds to seconds for Motion APIs. Reduced motion removes translation, height animation, sequencing and travelling effects while preserving immediate state changes. No bounce, shake, shimmer, overshoot, perpetual pulse, glow or dramatic full-page slide.

Validate touched fields on blur and the complete form on Save. Keep drafts on request failure/refetch. Dirty close asks Keep editing/Discard; untouched close does not. Trap and restore sheet/modal focus, lock background scroll, support Escape through the dirty check, connect errors with aria-describedby, announce save/error politely and focus the first invalid field after Save. Reorder has Move up/down buttons even when drag is offered. A successful sheet shows Saved for300ms, then closes and restores trigger focus; persistent manager/Aura/Appearance pages stay open and update their saved state. Aura-suggested values lose the AI badge once accepted, while optional provenance remains available.

### API and database contract

`B` means `/api/v1/yullo/owner/spaces/{space_id}`. Every endpoint derives owner from authenticated session, checks product=yullo and owned Yullo extension, and validates all referenced records in the same Space. Enforce existing cookie/CSRF/origin protections. Never trust user_id/review authority in the body. Errors: unavailable owned resource404, validation422, stale revision409, oversized upload413, rate limit429; DTO error shape `{code,message,field_errors,current_revision}`.

Entity CRUD: GET/POST `B/entities`; GET/PATCH/DELETE `B/entities/{id}`; POST `B/entities/reorder`; POST `B/entities/{id}/confirm`. Filter by allowlisted entity_type/kind, cursor and limit<=100. Use `app/yullo/services/persistence/entities.py` as the canonical validation and persistence interface. It may call the existing `app/yullo/services/entities/service.py` internally during migration, but routes, bootstrap code and new form work must import the persistence entry points. Move or adapt create_owner_entity/update_entity/confirm_entity/archive_entity there and add list_owner_entities/get_owner_entity/reorder_entities without duplicating rules. Identity is UUID primary ID plus immutable identity_key String(200), unique(space_id,entity_type,identity_key). Generate client create key once and reuse retries. Same identity/same normalized command returns prior object; conflicting payload requires explicit update.

Entity DTO: id,space_id,identity_key,entity_type,schema_version,payload_json,visibility,disclosure_mode,field_policies,revision,sort_order,updated_at. These are target fields, not proof they all exist. Add missing migrations safely. PATCH includes expected_revision; merge specified fields, validate complete result; null clears optional, arrays replace. DELETE archives under revision check. Reorder checks complete collection IDs and collection revision atomically. Config endpoints guard `yullo_configs.revision` and update only their typed namespace using a fresh JSON dict. Existing schema versions remain readable; extended payloads use version2 only after consumers understand it. Never disable extra=forbid.

Caller owns transaction. Save canonical record and registered event using append_domain_event atomically. Implement `finalize_space_mutation(db,user_id,space_id,public_content_changed,operation_key)` in `app/yullo/services/persistence/common.py`; it locks YulloSpace, advances context_version, and publishes only reviewed authorized changes for already-live Spaces. Drafts remain draft; private changes do not become public. Invalidate affected owner/Space queries, preview/public/Home/runtime after commit. Query keys include owner+Space; clear on logout. Do not optimistically expose public sensitive data.

### Visibility, provenance and output rules

Scopes: public=static Link+public Aura; public_aura=public chat only; owner_aura=authenticated selected-Space owner Aura only; private=no Aura responses. Owner editor can read all owned data. If owner Aura is absent, owner_aura stays stored and unavailable to inference. Disclosure: direct=eligible normal use; on_request=server-approved explicit relevant request; action_only=allowlisted action instead of raw prose. Restrictive disclosure suppresses raw static values too. Action URLs can expose their target; do not promise secrecy for mailto/tel/WhatsApp.

Persist missing entity visibility/disclosure/field_policies columns through forward migration; is_public alone is insufficient. Field policies narrow, never widen record policy. Sensitive input defaults private; public choice explicit. Owner confirmed fields cannot be overwritten by inferred updates. Extracted candidates are private/extracted with source item+KB+version+verified locator evidence; confidence is not authority. Recheck source/version on confirmation. Eligible public records must be active, reviewed and in a published Space. Public DTOs/tools/cards and retrieval must project approved fields BEFORE giving them to the model/browser. Mixed restricted source chunks cannot enter public context; invalidate stale projections after policy changes. Never implement privacy by CSS.

Existing evidence columns: entity_id,space_id,source_item_id,source_kb_id,source_version,locator_metadata. General facts remain kb_facts; KB groups/items/jobs store source material. Reuse existing storage; no per-form tables unless this file identifies a concrete missing requirement. Appearance canonical store is yullo_spaces.appearance_config; settings means yullo_configs.settings. No shared evaluation deletion is needed.

### Session boundaries and handoff

Own only this form's frontend folder, its approved persistence module, and small additive integration changes. Backend validation and persistence belong only in `app/yullo/services/persistence/`; thin authenticated routes belong in `app/yullo/api/space_data.py`. Do not create `services/forms/`, `schemas/forms/`, repository packages, or any additional backend directory without owner approval. Shared hotspots: form core/registry, API hooks, entity payload registry, public serializer, router registration and migrations. Check changes before editing; never overwrite whole shared files. If sessions run concurrently, use isolated branches and coordinate shared contracts/migrations; a self-contained document does not make shared-file writes conflict-free. Sequential small sessions are simplest.

At completion update the checkboxes/status in THIS file with date, actual files/endpoints, migration revision (and whether applied), checks run, remaining gaps and dependency features left unavailable. Report supported field types/schema version and public behavior. A later session should be able to continue from this file plus current code, without this chat. Do not mark mocked/provider-disabled functionality complete.


### Dependencies for this particular form

Hours are nested in the location v2 payload, so they can ship together without another form session. Geocoder is optional; manual address entry must work. A new location must be usable by future event selectors through the shared list API.

### Location visual polish — 2026-11-13

- Complete: physical locations use teal pins; remote locations use violet globes, with light/dark theme variants. Visibility and edit controls have semantic icons; actions retain the configured accent.
- Added a brief dashboard/content reveal and subtle pointer-hover feedback, respecting reduced motion. No looping motion.
- Files: `ui/src/yullo/forms/Locations.tsx`, `ui/src/yullo/screens/SpaceDashboard.tsx`, `ui/src/yullo/styles/tokens.css`.
- Verification: frontend type-check and production build passed; `git diff --check` passed. No browser or tests run. Visual verification remains pending approval.
- No API, schema, migration, saved-data or public visibility behavior changes.

### Location layout refinement — 2026-11-13

- Moved Locations to the dashboard bottom, after Events, posts & services.
- Replaced the dominant filled Add button with an outlined action; location cards use smaller colored icons, subtle borders and readable address sizing. Existing editing and visibility behavior preserved.
- Files: `Locations.tsx`, `SpaceDashboard.tsx`. Type-check and diff whitespace check passed. Browser and tests not run; visual verification pending.

### Saved location map previews — 2026-11-13

- Physical location cards now show a compact Google Maps preview and pin; clicking opens Google Maps. Remote locations omit the map.
- Reuses the configured SDK loader and coordinate validation. Saved coordinates take priority; older address-only records resolve for display without saving data. Missing configuration/provider failures retain an external map link.
- Added `ui/src/yullo/forms/LocationMapPreview.tsx`; integrated in `Locations.tsx`. Maps load near the viewport, with cleanup on unmount.
- Type-check and whitespace check passed. No browser, tests, migrations or database writes; provider rendering remains unverified.

### Responsive location cards — 2026-11-13

- Approved layout: two columns on desktop (1024px+), one on smaller screens; a third location starts the next row.
- Map preview spans each card below its details, reduced to 112px on mobile / 128px on larger screens.
- Changed `Locations.tsx` and `LocationMapPreview.tsx`. No persistence changes. Type-check and whitespace check passed; browser/tests not run.

- Responsive refinement: a single approved location occupies full width; two or more use two desktop columns (third starts next row). Mobile remains one column. Type-check and whitespace check passed; no browser/tests run.

- Add location action now shows only plus and map-pin icons, retaining an accessible label and tooltip. Existing creation behavior unchanged. Whitespace check passed; no browser/tests run.

### Compact online location view — 2026-11-13

- Online-only locations use a compact borderless row with a globe and `Online / Remote` label beside the name, preserving edit and visibility controls. No card-sized map placeholder.
- Physical cards retain their maps; their count alone determines one/two-column layout. Uses existing `is_remote` data; no new hybrid schema or link fields introduced.
- Changed `Locations.tsx`. Type-check and whitespace check passed; no browser/tests run.

- Online / Remote now uses a monitor icon, distinguishing it from the Public visibility globe. Changed `Locations.tsx`; whitespace check passed. No browser/tests run.
